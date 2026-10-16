import { accessSync, constants } from 'node:fs';

function isExecutable(filePath: string): boolean {
  try {
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * ffmpeg-static apunta a un path aunque el postinstall no haya bajado el binario.
 * En Render eso acaba en spawn ENOENT. Aquí se exige que el archivo exista.
 */
export async function findFfmpegBinary(): Promise<string | null> {
  const fromEnv = [process.env.FFMPEG_PATH, process.env.FFMPEG_BIN]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  for (const candidate of fromEnv) {
    if (isExecutable(candidate)) return candidate;
  }

  try {
    const mod = await import('ffmpeg-static');
    const bundled =
      (mod as { default?: string | null }).default ?? (mod as unknown as string);
    if (typeof bundled === 'string' && bundled.length > 0 && isExecutable(bundled)) {
      return bundled;
    }
  } catch {
    /* el paquete puede no estar */
  }

  return null;
}

export const FFMPEG_MISSING_MESSAGE =
  'ffmpeg no está instalado en el servidor. En Render el build debe ejecutar el postinstall de ffmpeg-static (pnpm onlyBuiltDependencies). Alternativa: variable FFMPEG_PATH con un binario ejecutable.';
