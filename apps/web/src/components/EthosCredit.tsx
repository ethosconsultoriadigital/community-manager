export const ETHOS_WEBSITE = 'https://www.ethosconsultoriadigital.com/';

type EthosCreditProps = {
  className?: string;
};

export function EthosCredit({ className = 'text-xs text-muted' }: EthosCreditProps) {
  return (
    <p className={className}>
      Desarrollado por{' '}
      <a
        href={ETHOS_WEBSITE}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-brand hover:underline"
      >
        Ethos Consultoría Digital
      </a>
    </p>
  );
}
