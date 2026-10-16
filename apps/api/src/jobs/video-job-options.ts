/**
 * Un clip de fal puede esperar FAL_QUEUE_MAX_WAIT_MS (default 20 min).
 * Un Reel de 2 escenas suma dos esperas más ffmpeg: el lock de 20 min
 * caducaba, BullMQ marcaba el job stalled y la fila se quedaba en processing.
 * 50 min cubre 2×20 min + composición. lockRenewTime corto aguanta un Redis lento.
 */
export const VIDEO_JOB_WORKER_OPTIONS = {
  concurrency: 1,
  lockDuration: 50 * 60 * 1000,
  lockRenewTime: 30_000,
  stalledInterval: 60_000,
  maxStalledCount: 1,
} as const;

/** Más que el peor caso legítimo (2 clips × 20 min + ffmpeg) para no matar un job vivo. */
export const STALE_VIDEO_JOB_MS = 55 * 60 * 1000;
