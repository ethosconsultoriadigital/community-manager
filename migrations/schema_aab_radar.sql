-- AAB Radar Tech: copy de Threads, estado escrito al sheet y posts de una fila.
-- Aditivo. RadarMex no usa estas columnas.

alter table source_items add column if not exists copy_threads text;
alter table source_items add column if not exists sheet_status text;
alter table source_items add column if not exists sheet_status_written text;

create table if not exists source_item_posts (
  source_item_id uuid not null references source_items(id) on delete cascade,
  post_id        uuid not null references posts(id) on delete cascade,
  agency_id      uuid not null references agencies(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (source_item_id, post_id)
);

create index if not exists idx_source_item_posts_post on source_item_posts (post_id);
create index if not exists idx_source_item_posts_agency on source_item_posts (agency_id);
