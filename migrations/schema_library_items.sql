-- Biblioteca de contenido reutilizable (textos, imágenes, videos) por cliente.
do $$ begin
  create type library_item_kind as enum ('text', 'image', 'video');
exception
  when duplicate_object then null;
end $$;

create table if not exists library_items (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid        not null references agencies(id) on delete cascade,
  client_id       uuid        not null references clients(id)  on delete cascade,
  created_by      uuid        references users(id) on delete set null,
  kind            library_item_kind not null,
  title           text,
  caption         text,
  hashtags        text[]      not null default '{}',
  storage_url     text,
  media_source    media_source,
  source_post_id  uuid        references posts(id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint library_items_text_or_media check (
    (kind = 'text' and caption is not null and length(trim(caption)) > 0)
    or (kind in ('image', 'video') and storage_url is not null and length(trim(storage_url)) > 0)
  )
);

create index if not exists idx_library_client on library_items (client_id, created_at desc);
create index if not exists idx_library_agency on library_items (agency_id);
create index if not exists idx_library_kind on library_items (client_id, kind);
