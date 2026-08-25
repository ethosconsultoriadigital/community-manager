-- ============================================================
-- Fase A — Usuario ↔ cliente (aislamiento por negocio)
-- Un login de manager/viewer queda ligado a un solo client.
-- ============================================================

alter table users
  add column if not exists is_active boolean not null default true;

create table user_client_assignments (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid        not null references agencies(id) on delete cascade,
  user_id     uuid        not null references users(id) on delete cascade,
  client_id   uuid        not null references clients(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id)
);

create index idx_user_client_agency on user_client_assignments (agency_id);
create index idx_user_client_client on user_client_assignments (client_id);
