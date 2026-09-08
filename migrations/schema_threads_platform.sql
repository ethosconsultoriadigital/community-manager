-- Threads: valor nuevo en social_platform (aditivo; no altera FB/IG).
-- PostgreSQL: ADD VALUE no puede ir en transacción en versiones antiguas;
-- el runner usa BEGIN/COMMIT; en PG 12+ ADD VALUE IF NOT EXISTS es seguro en TX reciente.
-- Si falla en TX, aplicar manualmente: ALTER TYPE social_platform ADD VALUE 'threads';

ALTER TYPE social_platform ADD VALUE IF NOT EXISTS 'threads';
