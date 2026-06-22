-- Tokens OAuth de Canva Connect por agencia (cifrados AES-256-GCM en aplicación)
ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS canva_access_token_enc bytea,
  ADD COLUMN IF NOT EXISTS canva_refresh_token_enc bytea,
  ADD COLUMN IF NOT EXISTS canva_token_expires_at timestamptz;
