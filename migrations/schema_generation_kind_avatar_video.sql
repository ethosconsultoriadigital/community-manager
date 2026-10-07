-- Añade kind=avatar_video a generations (personaje / lip-sync).
alter type generation_kind add value if not exists 'avatar_video';
