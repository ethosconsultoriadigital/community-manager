-- Portada vertical de historia (AAB). Nullable. RadarMex no la lee.
-- La API escribe y lee esta columna con SQL directo. Si aún no existe,
-- esas consultas fallan controladas y el post sale sin story; el resto no se toca.
alter table source_items add column if not exists story_image_url text;
