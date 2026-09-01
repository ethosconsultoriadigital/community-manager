-- Publicar también como Story (Facebook Page + Instagram)
alter table posts
  add column if not exists also_publish_as_story boolean not null default false;

alter table post_targets
  add column if not exists story_platform_post_id text,
  add column if not exists story_status text,
  add column if not exists story_error_message text;
