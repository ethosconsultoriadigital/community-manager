-- Añade kind=video a generations (Reels / video IA).
alter type generation_kind add value if not exists 'video';
