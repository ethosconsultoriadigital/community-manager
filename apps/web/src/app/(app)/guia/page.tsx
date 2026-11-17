import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseGuia } from '@/lib/guia-markdown';
import { GuiaView } from './GuiaView';

/** La guía se lee de apps/web/content/guia.md al compilar (fuente única, también del PDF). */
export const dynamic = 'force-static';

function loadGuia() {
  const file = path.join(process.cwd(), 'content', 'guia.md');
  return parseGuia(readFileSync(file, 'utf8'));
}

export default function GuiaPage() {
  const doc = loadGuia();
  return <GuiaView doc={doc} />;
}
