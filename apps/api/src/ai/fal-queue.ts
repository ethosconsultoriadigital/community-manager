import { BadRequestException, Logger } from '@nestjs/common';

type FalQueueSubmit = {
  request_id?: string;
  status_url?: string;
  response_url?: string;
  detail?: string;
  error?: string;
};

type FalQueueStatus = {
  status?: string;
  response_url?: string;
  error?: string;
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
      submitted.detail || submitted.error || `fal queue HTTP ${submitRes.status}`;
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
        `Error consultando fal: ${statusBody.error ?? statusRes.status}`,
      );
    }

    const st = (statusBody.status ?? '').toUpperCase();
    if (st === 'COMPLETED') {
      const resultRes = await fetch(statusBody.response_url || responseUrl, {
        headers: { Authorization: `Key ${input.apiKey}` },
      });
      const result = (await resultRes.json()) as Record<string, unknown> & {
        detail?: string;
        error?: string;
      };
      if (!resultRes.ok) {
        throw new BadRequestException(
          result.detail || result.error || `fal result HTTP ${resultRes.status}`,
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
