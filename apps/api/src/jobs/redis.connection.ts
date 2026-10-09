/**
 * Opciones ioredis para BullMQ en Redis gestionado (Render/Upstash).
 * `maxRetriesPerRequest: null` es obligatorio en workers BullMQ.
 */
export function bullRedisConnection(redisUrl: string) {
  return {
    url: redisUrl,
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
    connectTimeout: 30_000,
  };
}
