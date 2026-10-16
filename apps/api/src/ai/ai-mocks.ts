/**
 * En producción un mock silencioso parece un Reel/avatar roto.
 * En local/test, sin claves, el mock sigue sirviendo para desarrollar.
 * AI_ALLOW_MOCKS=true|false fuerza el comportamiento.
 */
export function aiMocksAllowed(config: {
  get(key: string): unknown;
}): boolean {
  const raw = config.get('AI_ALLOW_MOCKS');
  const flag = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (flag === 'true' || flag === '1' || flag === 'yes') return true;
  if (flag === 'false' || flag === '0' || flag === 'no') return false;
  return process.env.NODE_ENV !== 'production';
}
