import type { Client } from '@/lib/types';

type ClientScopeFieldProps = {
  label?: string;
  id?: string;
  clients: Client[];
  clientId: string;
  onClientIdChange: (id: string) => void;
  showSelector: boolean;
  selectedClient: Client | null;
  allowAll?: boolean;
  className?: string;
  selectClassName?: string;
};

export function ClientScopeField({
  label = 'Cliente',
  id = 'client',
  clients,
  clientId,
  onClientIdChange,
  showSelector,
  selectedClient,
  allowAll = false,
  className,
  selectClassName = 'rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink',
}: ClientScopeFieldProps) {
  if (!showSelector) {
    if (!selectedClient) {
      return (
        <div className={className}>
          <span className="mb-1 block text-sm text-muted">{label}</span>
          <p className="text-sm text-amber-700">
            No tienes un cliente asignado. Contacta al administrador de tu agencia.
          </p>
        </div>
      );
    }

    return (
      <div className={className}>
        <span className="mb-1 block text-sm text-muted">{label}</span>
        <p className="text-sm font-medium text-ink">{selectedClient.name}</p>
      </div>
    );
  }

  return (
    <label className={className ?? 'flex flex-col gap-1 text-sm'} htmlFor={id}>
      <span className="text-muted">{label}</span>
      <select
        id={id}
        value={clientId}
        onChange={(e) => onClientIdChange(e.target.value)}
        className={selectClassName}
      >
        {allowAll ? <option value="">Todos</option> : null}
        {clients.length === 0 ? (
          <option value="">Sin clientes</option>
        ) : (
          clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))
        )}
      </select>
    </label>
  );
}
