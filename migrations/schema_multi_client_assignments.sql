-- ============================================================
-- Multi-cliente por usuario (manager/viewer pueden llevar N negocios)
-- Antes: unique(user_id) → 1 cliente por usuario
-- Ahora: unique(user_id, client_id) → N clientes por usuario
-- ============================================================

alter table user_client_assignments
  drop constraint if exists user_client_assignments_user_id_key;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_client_assignments_user_id_client_id_key'
  ) then
    alter table user_client_assignments
      add constraint user_client_assignments_user_id_client_id_key
      unique (user_id, client_id);
  end if;
end $$;
