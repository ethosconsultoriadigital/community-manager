-- ============================================================
-- Community Manager Automático — Esquema base (MVP)
-- PostgreSQL 14+
-- Cubre: multi-tenant, clientes, cuentas sociales, contenido,
-- generación con IA, aprobación humana y publicación.
-- (Analítica de métricas y campañas de ads se añaden en fases
--  posteriores, sobre esta misma base.)
-- ============================================================

create extension if not exists "pgcrypto";   -- para gen_random_uuid()

-- ------------------------------------------------------------
-- Tipos enumerados
-- ------------------------------------------------------------
create type user_role         as enum ('owner', 'admin', 'manager', 'viewer');
create type social_platform   as enum ('instagram', 'facebook', 'tiktok', 'linkedin', 'x', 'youtube');
create type post_status        as enum ('draft', 'pending_approval', 'approved', 'scheduled', 'publishing', 'published', 'failed', 'archived');
create type target_status      as enum ('pending', 'publishing', 'published', 'failed');
create type media_type         as enum ('image', 'video');
create type media_source       as enum ('upload', 'ai_generated', 'canva');
create type generation_kind    as enum ('copy', 'image');
create type generation_status  as enum ('pending', 'processing', 'completed', 'failed');
create type approval_status    as enum ('pending', 'approved', 'rejected');

-- ------------------------------------------------------------
-- Núcleo multi-tenant
-- ------------------------------------------------------------
create table agencies (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table users (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid        not null references agencies(id) on delete cascade,
  email       text        not null,
  full_name   text,
  role        user_role   not null default 'manager',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (agency_id, email)
);
create index idx_users_agency on users (agency_id);

-- Marcas/empresas cuyas redes se gestionan
create table clients (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid        not null references agencies(id) on delete cascade,
  name        text        not null,
  -- Identidad de marca reutilizable: colores, logo, tono de voz, hashtags base
  brand       jsonb       not null default '{}'::jsonb,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_clients_agency on clients (agency_id);

-- ------------------------------------------------------------
-- Cuentas sociales conectadas vía OAuth
-- ------------------------------------------------------------
create table social_accounts (
  id                   uuid primary key default gen_random_uuid(),
  agency_id            uuid            not null references agencies(id) on delete cascade,
  client_id            uuid            not null references clients(id)  on delete cascade,
  platform             social_platform not null,
  external_account_id  text            not null,   -- ID en la plataforma (IG user id, FB page id...)
  username             text,
  -- Tokens cifrados en la capa de aplicación ANTES de guardar (nunca en texto plano)
  access_token_enc     bytea           not null,
  refresh_token_enc    bytea,
  token_expires_at     timestamptz,
  scopes               text[],
  is_active            boolean         not null default true,
  connected_at         timestamptz     not null default now(),
  updated_at           timestamptz     not null default now(),
  unique (platform, external_account_id)
);
create index idx_social_client  on social_accounts (client_id);
create index idx_social_expiry  on social_accounts (token_expires_at);  -- refresco proactivo de tokens

-- ------------------------------------------------------------
-- Contenido
-- ------------------------------------------------------------
create table posts (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid        not null references agencies(id) on delete cascade,
  client_id     uuid        not null references clients(id)  on delete cascade,
  created_by    uuid        references users(id) on delete set null,
  status        post_status not null default 'draft',
  caption       text,
  hashtags      text[],
  scheduled_at  timestamptz,                  -- momento de publicación
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_posts_client on posts (client_id);
create index idx_posts_due    on posts (status, scheduled_at);  -- el worker busca posts vencidos

-- Un post puede publicarse en varias cuentas; cada destino lleva su propio estado
create table post_targets (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid          not null references posts(id)           on delete cascade,
  social_account_id uuid          not null references social_accounts(id) on delete cascade,
  status            target_status not null default 'pending',
  platform_post_id  text,                       -- ID devuelto por la plataforma al publicar
  error_message     text,
  attempts          int           not null default 0,
  published_at      timestamptz,
  unique (post_id, social_account_id)
);
create index idx_targets_post    on post_targets (post_id);
create index idx_targets_account on post_targets (social_account_id);

create table media_assets (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid         not null references agencies(id) on delete cascade,
  post_id      uuid         references posts(id) on delete cascade,
  type         media_type   not null,
  source       media_source not null default 'upload',
  storage_url  text         not null,            -- ruta en S3 / R2
  width        int,
  height       int,
  position     int          not null default 0,  -- orden dentro de un carrusel
  created_at   timestamptz  not null default now()
);
create index idx_media_post on media_assets (post_id);

-- ------------------------------------------------------------
-- Generación con IA (copy + imagen) — trazabilidad por job
-- ------------------------------------------------------------
create table generations (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid              not null references agencies(id) on delete cascade,
  post_id       uuid              references posts(id) on delete cascade,
  kind          generation_kind   not null,           -- copy | image
  status        generation_status not null default 'pending',
  prompt        text,
  model         text,                                 -- p.ej. 'flux', 'gpt-image', 'claude-...'
  output        jsonb,                                -- texto generado o metadatos de la imagen
  media_id      uuid              references media_assets(id) on delete set null,
  created_at    timestamptz       not null default now(),
  completed_at  timestamptz
);
create index idx_gen_post   on generations (post_id);
create index idx_gen_status on generations (status);

-- ------------------------------------------------------------
-- Aprobación (humano en el loop)
-- ------------------------------------------------------------
create table approvals (
  id           uuid            primary key default gen_random_uuid(),
  post_id      uuid            not null references posts(id) on delete cascade,
  reviewer_id  uuid            references users(id) on delete set null,
  status       approval_status not null default 'pending',
  comment      text,
  created_at   timestamptz     not null default now()
);
create index idx_approvals_post on approvals (post_id);

-- ============================================================
-- FASES POSTERIORES (no incluidas todavía):
--   * insights          -> métricas por post/cuenta (Pilar 3: analítica)
--   * ad_campaigns       -> campañas, conjuntos de anuncios, presupuesto (Pilar 4)
--   * canva_templates    -> referencia a brand templates + campos de autofill
-- Se añaden sobre este mismo núcleo sin romper nada.
-- ============================================================
