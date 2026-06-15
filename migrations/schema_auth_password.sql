-- ============================================================
-- Fase 2 — Autenticación: hash de contraseña en users
-- (se aplica DESPUÉS de schema_content_sources.sql)
-- ============================================================

alter table users
  add column password_hash text not null default '';

-- Quitar default tras añadir la columna (solo para filas existentes en dev)
alter table users
  alter column password_hash drop default;
