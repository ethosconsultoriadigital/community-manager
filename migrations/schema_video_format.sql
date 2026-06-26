-- Fase D: formato de video (feed vs Reels en Instagram)
create type video_format as enum ('feed', 'reel');

alter table posts
  add column video_format video_format;
