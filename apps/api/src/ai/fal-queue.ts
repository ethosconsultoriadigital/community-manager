import { BadRequestException, Logger } from '@nestjs/common';

type FalQueueSubmit = {
  request_id?: string;
  status_url?: string;
  response_url?: string;
  detail?: unknown;
  error?: unknown;
};

type FalQueueStatus = {
  status?: string;
  response_url?: string;
  error?: unknown;
};

const POLL_MS = 2500;
const MAX_POLLS = 90;

/**
 * Cola genérica fal.ai (submit + poll). Reutilizable por video / lip-sync.
 */
export async function runFalQueueJob(input: {
  apiKey: string;
  model: string;
  body: Record<string, unknown>;
  logger?: Logger;
  failLabel?: string;
}): Promise<Record<string, unknown>> {
  const label = input.failLabel ?? 'fal';
  const logger = input.logger;

  const submitRes = await fetch(`https://queue.fal.run/${input.model}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input.body),
  });
  const submitted = (await submitRes.json()) as FalQueueSubmit;
  if (!submitRes.ok) {
    const message =
      formatFalError(submitted.detail) ||
      formatFalError(submitted.error) ||
      `fal queue HTTP ${submitRes.status}`;
    logger?.warn(`${label} submit failed: ${message}`);
    throw new BadRequestException(`No se pudo iniciar ${label}: ${message}`);
  }

  const statusUrl = submitted.status_url;
  const responseUrl = submitted.response_url;
  if (!statusUrl || !responseUrl) {
    throw new BadRequestException('fal no devolvió status_url/response_url');
  }

  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_MS);
    const statusRes = await fetch(statusUrl, {
      headers: { Authorization: `Key ${input.apiKey}` },
    });
    const statusBody = (await statusRes.json()) as FalQueueStatus;
    if (!statusRes.ok) {
      throw new BadRequestException(
        `Error consultando fal: ${formatFalError(statusBody.error) || statusRes.status}`,
      );
    }

    const st = (statusBody.status ?? '').toUpperCase();
    if (st === 'COMPLETED') {
      const resultRes = await fetch(statusBody.response_url || responseUrl, {
        headers: { Authorization: `Key ${input.apiKey}` },
      });
      const result = (await resultRes.json()) as Record<string, unknown> & {
        detail?: unknown;
        error?: unknown;
      };
      if (!resultRes.ok) {
        throw new BadRequestException(
          formatFalError(result.detail) ||
            formatFalError(result.error) ||
            `fal result HTTP ${resultRes.status}`,
        );
      }
      return result;
    }
    if (st === 'FAILED' || st === 'CANCELLED') {
      throw new BadRequestException(`${label} falló en fal (${st})`);
    }
  }

  throw new BadRequestException(
    `${label} tardó demasiado. Intenta de nuevo en unos minutos.`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** fal a menudo devuelve `detail` como objeto/array; evita "[object Object]". */
export function formatFalError(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>;
          if (typeof rec.msg === 'string') return rec.msg;
          if (typeof rec.message === 'string') return rec.message;
        }
        try {
          return JSON.stringify(item);
        } catch {
          return String(item);
        }
      })
      .filter(Boolean)
      .join('; ');
  }
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    if (typeof rec.message === 'string') return rec.message;
    if (typeof rec.msg === 'string') return rec.msg;
    try {
      return JSON.stringify(value).slice(0, 500);
    } catch {
      return 'Error desconocido de fal';
    }
  }
  return String(value);
}
