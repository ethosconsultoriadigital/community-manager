-- Ubicación opcional en posts (Facebook place / Instagram location_id).
alter table posts
  add column if not exists place_id   text,
  add column if not exists place_name text;
