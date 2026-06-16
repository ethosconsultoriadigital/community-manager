import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type {
  IngestSheetInput,
  IngestSheetResult,
  SheetIngestProvider,
  SheetRow,
} from '../interfaces/sheet-ingest-provider.interface';

const FIXTURE_NAME = 'example-sheet.json';

function resolveFixturePath(configPath?: string): string {
  if (configPath && existsSync(configPath)) return configPath;

  const candidates = [
    join(__dirname, 'fixtures', FIXTURE_NAME),
    join(process.cwd(), 'src/content-sources/fixtures', FIXTURE_NAME),
    join(process.cwd(), 'apps/api/src/content-sources/fixtures', FIXTURE_NAME),
  ];

  const found = candidates.find((path) => existsSync(path));
  if (!found) {
    throw new Error('No se encontró el fixture example-sheet.json');
  }
  return found;
}

export class MockSheetIngestProvider implements SheetIngestProvider {
  async fetchRows(input: IngestSheetInput): Promise<IngestSheetResult> {
    const configPath =
      typeof input.config.fixturePath === 'string' ? input.config.fixturePath : undefined;
    const fixturePath = resolveFixturePath(configPath);

    const raw = await readFile(fixturePath, 'utf-8');
    const rows = JSON.parse(raw) as SheetRow[];
    return { rows };
  }
}

export function computeDedupHash(row: SheetRow): string {
  const payload = [row.title ?? '', row.source_url ?? '', row.external_id].join('|');
  return createHash('sha256').update(payload).digest('hex');
}
