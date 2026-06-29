-- Fase I: métricas de posts publicados (Pilar 3 — analítica Meta)

create table post_insights (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid            not null references agencies(id) on delete cascade,
  post_target_id   uuid            not null references post_targets(id) on delete cascade,
  impressions      int,
  reach            int,
  likes            int,
  comments         int,
  shares           int,
  saves            int,
  engagement       int,
  fetched_at       timestamptz     not null default now(),
  unique (post_target_id)
);

create index idx_post_insights_agency  on post_insights (agency_id);
create index idx_post_insights_fetched on post_insights (fetched_at);
