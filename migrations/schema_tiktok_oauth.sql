-- TikTok OAuth: metadatos de perfil y estado de conexión (aditivo).
-- No altera migraciones previas ni el enum social_platform (tiktok ya existe).

ALTER TABLE social_accounts
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS connection_status text,
  ADD COLUMN IF NOT EXISTS refresh_expires_at timestamptz;

COMMENT ON COLUMN social_accounts.connection_status IS
  'NULL=conectada; permisos_incompletos | requiere_reconexion';
COMMENT ON COLUMN social_accounts.refresh_expires_at IS
  'Expiración del refresh_token (p. ej. TikTok)';
