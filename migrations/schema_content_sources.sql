-- ============================================================
-- Community Manager Automático — Extensión: fuentes de contenido
-- PostgreSQL 14+  (se aplica DESPUÉS de schema_base.sql)
-- Soporta dos patrones que conviven sobre el mismo pipeline:
--   1) calendario fijo (posts creados por humano/IA)
--   2) news radar (ingesta tipo sheet/RSS con sentimiento)
-- ============================================================

create type source_type as enum ('manual_calendar', 'news_radar', 'sheet', 'rss');
create type item_status as enum ('new', 'pending_approval', 'approved', 'rejected', 'published', 'duplicate');

-- Cada cliente configura una o varias fuentes
create table content_sources (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid        not null references agencies(id) on delete cascade,
  client_id   uuid        not null references clients(id)  on delete cascade,
  type        source_type not null,
  name        text        not null,
  -- Configuración específica: URL del sheet, feeds RSS, mapeo de columnas...
  config      jsonb       not null default '{}'::jsonb,
  -- Umbral para auto-marcar un item como candidato a publicar
  min_score   numeric(3,2),
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_sources_client on content_sources (client_id);

-- Una fila ingerida = una fila de tu sheet (staging antes de ser post)
create table source_items (
  id               uuid        primary key default gen_random_uuid(),
  agency_id        uuid        not null references agencies(id)        on delete cascade,
  client_id        uuid        not null references clients(id)         on delete cascade,
  source_id        uuid        not null references content_sources(id) on delete cascade,
  external_id      text        not null,        -- p.ej. 'noticia_1780943034459'
  captured_at      timestamptz,                 -- 'fecha_captura' ya convertida
  origin           text,                        -- 'fuente': El Universal, Expansion...
  source_url       text,                        -- 'url_original'
  title            text,
  summary          text,
  category         text,
  sentiment        text,                        -- Positivo / Negativo / Neutral
  sentiment_score  numeric(3,2),                -- 'score_sentimiento'
  sentiment_reason text,                        -- 'razon_sentimiento'
  image_url        text,                        -- ojo: derechos de la fuente
  copy_facebook    text,
  copy_instagram   text,
  copy_x           text,
  hashtags         text[],
  flagged_publish  boolean     not null default false,  -- 'publicar'
  dedup_hash       text,                        -- detección de duplicados
  status           item_status not null default 'new',
  -- Cuando el item se aprueba, se promueve a un post y se enlaza aquí
  post_id          uuid        references posts(id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (source_id, external_id)
);
create index idx_items_source  on source_items (source_id);
create index idx_items_status  on source_items (status);
create index idx_items_score   on source_items (sentiment_score);
create index idx_items_dedup   on source_items (dedup_hash);

-- Cada post recuerda de qué fuente vino (calendario, radar, etc.)
alter table posts
  add column content_source_id uuid references content_sources(id) on delete set null;
create index idx_posts_source on posts (content_source_id);
