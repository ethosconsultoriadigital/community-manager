'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { AdminUserListItem, Client, UserRole } from '@/lib/types';

function isAgencyAdmin(role: UserRole) {
  return role === 'owner' || role === 'admin';
}

export default function AdminPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [newClientName, setNewClientName] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);

  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userFullName, setUserFullName] = useState('');
  const [userRole, setUserRole] = useState<'owner' | 'manager' | 'viewer'>('manager');
  const [userClientIds, setUserClientIds] = useState<string[]>([]);
  const [creatingUser, setCreatingUser] = useState(false);

  const [connectingClientId, setConnectingClientId] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [busyClientId, setBusyClientId] = useState<string | null>(null);

  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editClientName, setEditClientName] = useState('');

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserFullName, setEditUserFullName] = useState('');
  const [editUserRole, setEditUserRole] = useState<'owner' | 'manager' | 'viewer'>('manager');
  const [editUserClientIds, setEditUserClientIds] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    const [clientsData, usersData] = await Promise.all([
      apiFetch<Client[]>('/clients'),
      apiFetch<AdminUserListItem[]>('/admin/users'),
    ]);
    const active = clientsData.filter((c) => c.is_active);
    setClients(active);
    setUsers(usersData);
    setUserClientIds((prev) => {
      if (prev.length > 0) return prev.filter((id) => active.some((c) => c.id === id));
      return active[0] ? [active[0].id] : [];
    });
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!isAgencyAdmin(user.role)) {
      router.replace('/inicio');
      return;
    }
    loadData()
      .catch(() => setError('No se pudo cargar el panel de administración'))
      .finally(() => setLoading(false));
  }, [authLoading, user, router, loadData]);

  const usersByClientId = useMemo(() => {
    const map = new Map<string, AdminUserListItem[]>();
    for (const u of users) {
      const assigned = u.clients?.length ? u.clients : u.client ? [u.client] : [];
      for (const c of assigned) {
        const list = map.get(c.id) ?? [];
        list.push(u);
        map.set(c.id, list);
      }
    }
    return map;
  }, [users]);

  function toggleCreateClientId(clientId: string) {
    setUserClientIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId],
    );
  }

  function toggleEditClientId(clientId: string) {
    setEditUserClientIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId],
    );
  }

  async function handleCreateClient(e: FormEvent) {
    e.preventDefault();
    if (!newClientName.trim()) return;
    setError(null);
    setMessage(null);
    setCreatingClient(true);
    try {
      const client = await apiFetch<Client>('/clients', {
        method: 'POST',
        body: JSON.stringify({ name: newClientName.trim() }),
      });
      setNewClientName('');
      setMessage(`Cliente «${client.name}» creado`);
      await loadData();
      setUserClientIds((prev) => (prev.includes(client.id) ? prev : [...prev, client.id]));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al crear cliente');
    } finally {
      setCreatingClient(false);
    }
  }

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if ((userRole === 'manager' || userRole === 'viewer') && userClientIds.length === 0) {
      setError('Manager y viewer requieren al menos un cliente asignado');
      return;
    }
    setCreatingUser(true);
    try {
      await apiFetch('/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: userEmail.trim(),
          password: userPassword,
          fullName: userFullName.trim() || undefined,
          role: userRole,
          ...(userRole === 'owner' ? {} : { clientIds: userClientIds }),
        }),
      });
      setUserEmail('');
      setUserPassword('');
      setUserFullName('');
      setUserRole('manager');
      setMessage(
        userRole === 'owner'
          ? 'Usuario owner creado'
          : 'Usuario creado y vinculado a los clientes seleccionados',
      );
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al crear usuario');
    } finally {
      setCreatingUser(false);
    }
  }

  async function connectMeta(clientId: string) {
    setConnectingClientId(clientId);
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>(
        `/oauth/meta/connect-url?clientId=${encodeURIComponent(clientId)}`,
      );
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar Meta');
      setConnectingClientId(null);
    }
  }

  async function toggleUserActive(target: AdminUserListItem) {
    if (target.role === 'owner') return;
    setBusyUserId(target.id);
    setError(null);
    setMessage(null);
    try {
      await apiFetch(`/admin/users/${target.id}/${target.isActive ? 'deactivate' : 'activate'}`, {
        method: 'PATCH',
      });
      setMessage(target.isActive ? 'Usuario desactivado' : 'Usuario activado');
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al cambiar estado');
    } finally {
      setBusyUserId(null);
    }
  }

  async function resetPassword(target: AdminUserListItem) {
    if (target.role === 'owner') return;
    const password = prompt(`Nueva contraseña para ${target.email} (mín. 8 caracteres):`);
    if (!password) return;
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    setBusyUserId(target.id);
    setError(null);
    setMessage(null);
    try {
      await apiFetch(`/admin/users/${target.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      setMessage(`Contraseña actualizada para ${target.email}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al resetear contraseña');
    } finally {
      setBusyUserId(null);
    }
  }

  function startEditClient(client: Client) {
    setEditingClientId(client.id);
    setEditClientName(client.name);
    setError(null);
    setMessage(null);
  }

  function cancelEditClient() {
    setEditingClientId(null);
    setEditClientName('');
  }

  async function saveEditClient(clientId: string) {
    const name = editClientName.trim();
    if (!name) return;
    setBusyClientId(clientId);
    setError(null);
    setMessage(null);
    try {
      await apiFetch(`/clients/${clientId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
      setEditingClientId(null);
      setEditClientName('');
      setMessage('Cliente actualizado');
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al editar cliente');
    } finally {
      setBusyClientId(null);
    }
  }

  async function deleteClient(client: Client) {
    const linked = usersByClientId.get(client.id) ?? [];
    if (linked.length > 0) {
      setError(
        `No se puede eliminar «${client.name}»: tiene ${linked.length} usuario(s) asignado(s). Reasígnalos o elimínalos primero.`,
      );
      return;
    }
    if (
      !confirm(
        `¿Eliminar el cliente «${client.name}»? Se borrarán también sus cuentas Meta, posts y datos asociados.`,
      )
    ) {
      return;
    }
    setBusyClientId(client.id);
    setError(null);
    setMessage(null);
    try {
      await apiFetch(`/clients/${client.id}`, { method: 'DELETE' });
      setMessage(`Cliente «${client.name}» eliminado`);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al eliminar cliente');
    } finally {
      setBusyClientId(null);
    }
  }

  function startEditUser(target: AdminUserListItem) {
    setEditingUserId(target.id);
    setEditUserFullName(target.fullName ?? '');
    setEditUserRole(
      target.role === 'viewer'
        ? 'viewer'
        : target.role === 'manager'
          ? 'manager'
          : 'owner',
    );
    const assigned = target.clients?.length
      ? target.clients.map((c) => c.id)
      : target.client
        ? [target.client.id]
        : [];
    setEditUserClientIds(assigned);
    setError(null);
    setMessage(null);
  }

  function cancelEditUser() {
    setEditingUserId(null);
  }

  function isEditableUser(role: UserRole) {
    return role !== 'owner';
  }

  function needsClient(role: 'owner' | 'manager' | 'viewer') {
    return role === 'manager' || role === 'viewer';
  }

  async function saveEditUser(userId: string) {
    setBusyUserId(userId);
    setError(null);
    setMessage(null);
    try {
      if (needsClient(editUserRole) && editUserClientIds.length === 0) {
        setError('Manager y viewer requieren al menos un cliente asignado');
        return;
      }
      const body: {
        fullName?: string;
        role?: 'owner' | 'manager' | 'viewer';
        clientIds?: string[];
      } = {
        fullName: editUserFullName.trim(),
        role: editUserRole,
      };
      if (needsClient(editUserRole)) {
        body.clientIds = editUserClientIds;
      }
      await apiFetch(`/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setEditingUserId(null);
      setMessage('Usuario actualizado');
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al editar usuario');
    } finally {
      setBusyUserId(null);
    }
  }

  async function deleteUser(target: AdminUserListItem) {
    if (target.role === 'owner') return;
    if (
      !confirm(
        `¿Eliminar al usuario ${target.email}? Perderá acceso de inmediato y no se puede deshacer.`,
      )
    ) {
      return;
    }
    setBusyUserId(target.id);
    setError(null);
    setMessage(null);
    try {
      await apiFetch(`/admin/users/${target.id}`, { method: 'DELETE' });
      setMessage(`Usuario ${target.email} eliminado`);
      if (editingUserId === target.id) setEditingUserId(null);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al eliminar usuario');
    } finally {
      setBusyUserId(null);
    }
  }

  if (authLoading || loading) {
    return <p className="text-muted">Cargando administración…</p>;
  }

  if (!user || !isAgencyAdmin(user.role)) {
    return null;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink">Administración</h1>
        <p className="text-sm text-muted">
          Crea clientes (negocios), usuarios de acceso y conecta sus cuentas Meta.
        </p>
      </div>

      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="space-y-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-medium text-ink">Clientes (negocios)</h2>
        <form onSubmit={handleCreateClient} className="flex flex-wrap gap-2">
          <input
            type="text"
            value={newClientName}
            onChange={(e) => setNewClientName(e.target.value)}
            placeholder="Nombre del negocio"
            className="min-w-[200px] flex-1 rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink"
            required
          />
          <button
            type="submit"
            disabled={creatingClient}
            className="rounded-md bg-brand px-4 py-2 text-sm text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {creatingClient ? 'Creando…' : 'Crear cliente'}
          </button>
        </form>

        {clients.length === 0 ? (
          <p className="text-sm text-muted">Aún no hay clientes. Crea el primero arriba.</p>
        ) : (
          <ul className="space-y-2">
            {clients.map((client) => {
              const linked = usersByClientId.get(client.id) ?? [];
              return (
                <li
                  key={client.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line-strong bg-white px-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    {editingClientId === client.id ? (
                      <input
                        type="text"
                        value={editClientName}
                        onChange={(e) => setEditClientName(e.target.value)}
                        className="w-full max-w-xs rounded-md border border-line-strong bg-white px-2 py-1 text-sm text-ink"
                        autoFocus
                      />
                    ) : (
                      <p className="text-sm font-medium text-ink">{client.name}</p>
                    )}
                    <p className="text-xs text-muted">
                      {linked.length === 0
                        ? 'Sin usuario asignado'
                        : `${linked.length} usuario(s): ${linked.map((u) => u.email).join(', ')}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {editingClientId === client.id ? (
                      <>
                        <button
                          type="button"
                          disabled={busyClientId === client.id}
                          onClick={() => saveEditClient(client.id)}
                          className="rounded border border-brand px-2 py-1 text-xs text-brand hover:bg-[#E7F3FF] disabled:opacity-50"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          disabled={busyClientId === client.id}
                          onClick={cancelEditClient}
                          className="rounded border border-line-strong px-2 py-1 text-xs text-muted hover:bg-canvas disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={busyClientId === client.id}
                          onClick={() => startEditClient(client)}
                          className="rounded border border-line-strong px-2 py-1 text-xs text-muted hover:bg-canvas disabled:opacity-50"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          disabled={busyClientId === client.id}
                          onClick={() => deleteClient(client)}
                          className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          Eliminar
                        </button>
                        <button
                          type="button"
                          onClick={() => connectMeta(client.id)}
                          disabled={connectingClientId === client.id}
                          className="rounded-md border border-brand px-3 py-1.5 text-xs text-brand hover:bg-[#E7F3FF] disabled:opacity-50"
                        >
                          {connectingClientId === client.id ? 'Redirigiendo…' : 'Conectar Meta'}
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-4 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-medium text-ink">Nuevo usuario de acceso</h2>
        <form onSubmit={handleCreateUser} className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-muted">Email</span>
            <input
              type="email"
              required
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-line-strong bg-white px-3 py-2 text-ink"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">Contraseña temporal</span>
            <input
              type="password"
              required
              minLength={8}
              value={userPassword}
              onChange={(e) => setUserPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-line-strong bg-white px-3 py-2 text-ink"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">Nombre (opcional)</span>
            <input
              type="text"
              value={userFullName}
              onChange={(e) => setUserFullName(e.target.value)}
              className="mt-1 w-full rounded-md border border-line-strong bg-white px-3 py-2 text-ink"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">Rol</span>
            <select
              value={userRole}
              onChange={(e) => setUserRole(e.target.value as 'owner' | 'manager' | 'viewer')}
              className="mt-1 w-full rounded-md border border-line-strong bg-white px-3 py-2 text-ink"
            >
              <option value="owner">Owner (administración completa)</option>
              <option value="manager">Manager (publicar)</option>
              <option value="viewer">Viewer (solo lectura)</option>
            </select>
          </label>
          {needsClient(userRole) ? (
            <fieldset className="sm:col-span-2">
              <legend className="mb-2 text-sm text-muted">Clientes asignados (uno o varios)</legend>
              {clients.length === 0 ? (
                <p className="text-xs text-muted">Crea un cliente primero</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {clients.map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-line-strong px-3 py-1.5 text-xs text-muted"
                    >
                      <input
                        type="checkbox"
                        checked={userClientIds.includes(c.id)}
                        onChange={() => toggleCreateClientId(c.id)}
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          ) : (
            <p className="text-xs text-muted sm:col-span-2">
              El rol owner no requiere cliente asignado: gestiona toda la agencia.
            </p>
          )}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={creatingUser || (needsClient(userRole) && clients.length === 0)}
              className="rounded-md bg-brand px-4 py-2 text-sm text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {creatingUser ? 'Creando…' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-ink">Usuarios ({users.length})</h2>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="min-w-full text-sm">
            <thead className="bg-canvas text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Rol</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-line bg-surface">
                  <td className="px-3 py-2 text-ink">
                    {editingUserId === u.id ? (
                      <span className="text-sm">{u.email}</span>
                    ) : (
                      <>
                        {u.email}
                        {u.fullName ? (
                          <span className="block text-xs text-muted">{u.fullName}</span>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {editingUserId === u.id && isEditableUser(u.role) ? (
                      <select
                        value={editUserRole}
                        onChange={(e) =>
                          setEditUserRole(e.target.value as 'owner' | 'manager' | 'viewer')
                        }
                        className="rounded border border-line-strong bg-white px-2 py-1 text-xs text-ink"
                      >
                        <option value="owner">owner</option>
                        <option value="manager">manager</option>
                        <option value="viewer">viewer</option>
                      </select>
                    ) : (
                      u.role
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {editingUserId === u.id &&
                    isEditableUser(u.role) &&
                    needsClient(editUserRole) ? (
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {clients.map((c) => (
                          <label
                            key={c.id}
                            className="flex items-center gap-1 rounded border border-line-strong px-1.5 py-0.5 text-[11px]"
                          >
                            <input
                              type="checkbox"
                              checked={editUserClientIds.includes(c.id)}
                              onChange={() => toggleEditClientId(c.id)}
                            />
                            {c.name}
                          </label>
                        ))}
                      </div>
                    ) : (
                      (u.clients?.length
                        ? u.clients.map((c) => c.name).join(', ')
                        : u.client?.name) ?? '—'
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        u.isActive
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {u.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {u.role === 'owner' ? (
                      <span className="text-xs text-muted">Propietario</span>
                    ) : editingUserId === u.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editUserFullName}
                          onChange={(e) => setEditUserFullName(e.target.value)}
                          placeholder="Nombre (opcional)"
                          className="block w-full min-w-[140px] rounded border border-line-strong bg-white px-2 py-1 text-xs text-ink"
                        />
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            disabled={busyUserId === u.id}
                            onClick={() => saveEditUser(u.id)}
                            className="rounded border border-brand px-2 py-1 text-xs text-brand hover:bg-[#E7F3FF] disabled:opacity-50"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            disabled={busyUserId === u.id}
                            onClick={cancelEditUser}
                            className="rounded border border-line-strong px-2 py-1 text-xs text-muted hover:bg-canvas disabled:opacity-50"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          disabled={busyUserId === u.id}
                          onClick={() => startEditUser(u)}
                          className="rounded border border-line-strong px-2 py-1 text-xs text-muted hover:bg-canvas disabled:opacity-50"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          disabled={busyUserId === u.id}
                          onClick={() => toggleUserActive(u)}
                          className="rounded border border-line-strong px-2 py-1 text-xs text-muted hover:bg-canvas disabled:opacity-50"
                        >
                          {u.isActive ? 'Desactivar' : 'Activar'}
                        </button>
                        <button
                          type="button"
                          disabled={busyUserId === u.id}
                          onClick={() => resetPassword(u)}
                          className="rounded border border-line-strong px-2 py-1 text-xs text-muted hover:bg-canvas disabled:opacity-50"
                        >
                          Reset pass
                        </button>
                        <button
                          type="button"
                          disabled={busyUserId === u.id}
                          onClick={() => deleteUser(u)}
                          className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
