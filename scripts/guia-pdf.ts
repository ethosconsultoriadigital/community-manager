/**
 * Genera el PDF de la Guía a partir de apps/web/content/guia.md (la misma fuente que /guia).
 *
 *   pnpm guia:pdf                 → apps/web/public/guia/Guia-Community-Manager.pdf
 *   pnpm guia:pdf ruta/salida.pdf → otra ruta
 *
 * Usa Chrome/Chromium en modo headless (variable CHROME_PATH o rutas habituales).
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  mkdtempSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { escapeHtml, parseGuia } from '../apps/web/src/lib/guia-markdown';

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'apps/web/content/guia.md');
const output = path.resolve(
  process.argv[2] ?? path.join(root, 'apps/web/public/guia/Guia-Community-Manager.pdf'),
);

function findChrome(): string {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter((c): c is string => Boolean(c));
  const found = candidates.find((c) => existsSync(c));
  if (!found) {
    throw new Error(
      'No se encontró Chrome/Chromium. Define CHROME_PATH con la ruta al ejecutable.',
    );
  }
  return found;
}

const CSS = `
@page { size: A4; margin: 16mm 14mm 18mm; }
* { box-sizing: border-box; }
body { font-family: "Poppins", "Segoe UI", Arial, sans-serif; color: #1b1f24; font-size: 10.5pt; line-height: 1.55; margin: 0; }
.cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; page-break-after: always; }
.cover img { height: 22mm; margin-bottom: 18mm; }
.cover h1 { font-size: 26pt; margin: 0 0 6mm; line-height: 1.2; }
.cover p { color: #555; margin: 0 0 3mm; }
.toc { page-break-after: always; }
.toc h2 { font-size: 16pt; }
.toc ol { padding-left: 6mm; }
.toc li { margin: 1.5mm 0; }
.toc ul { list-style: none; padding-left: 5mm; }
.toc ul { font-size: 9pt; color: #555; }
.toc a { color: inherit; text-decoration: none; }
section { page-break-before: always; }
h2 { font-size: 17pt; border-bottom: 2px solid #e0a100; padding-bottom: 2mm; margin: 0 0 4mm; }
h3 { font-size: 12.5pt; margin: 6mm 0 2mm; page-break-after: avoid; }
h4 { font-size: 11pt; margin: 4mm 0 1.5mm; }
p { margin: 2mm 0; }
ul, ol { margin: 2mm 0; padding-left: 6mm; }
li { margin: 1mm 0; }
a { color: #8a5a00; }
code { font-size: 9pt; background: #f1f1f1; padding: 0 1mm; border-radius: 1mm; }
blockquote { margin: 3mm 0; padding: 2mm 4mm; border-left: 3px solid #e0a100; background: #fff7e0; border-radius: 1.5mm; page-break-inside: avoid; }
.guia-table { margin: 3mm 0; }
table { width: 100%; border-collapse: collapse; font-size: 9.5pt; page-break-inside: auto; }
tr { page-break-inside: avoid; }
th, td { border: 1px solid #d5d5d5; padding: 1.5mm 2mm; text-align: left; vertical-align: top; }
th { background: #f4f4f4; }
`;

function buildHtml(): string {
  const doc = parseGuia(readFileSync(source, 'utf8'));
  const logo = path.join(root, 'apps/web/public/ethos-logo.png');
  const logoTag = existsSync(logo)
    ? `<img src="${pathToFileURL(logo).href}" alt="Ethos" />`
    : '';
  const fecha = new Date().toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Mexico_City',
  });
  const toc = doc.sections
    .map(
      (s) =>
        `<li><a href="#${s.id}">${escapeHtml(s.title)}</a>${
          s.children.length
            ? `<ul>${s.children
                .map((c) => `<li><a href="#${c.id}">${escapeHtml(c.title)}</a></li>`)
                .join('')}</ul>`
            : ''
        }</li>`,
    )
    .join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(
    doc.title,
  )}</title><style>${CSS}</style></head><body>
<div class="cover">${logoTag}<h1>${escapeHtml(doc.title)}</h1><p>Manual de uso paso a paso.</p><p>Versión del ${fecha}.</p></div>
<div class="toc"><div class="intro">${doc.introHtml}</div><h2>Índice</h2><ol>${toc}</ol></div>
${doc.sections.map((s) => `<section>${s.html}</section>`).join('\n')}
</body></html>`;
}

function main() {
  const html = buildHtml();
  const dir = mkdtempSync(path.join(tmpdir(), 'guia-pdf-'));
  const htmlFile = path.join(dir, 'guia.html');
  writeFileSync(htmlFile, html, 'utf8');
  mkdirSync(path.dirname(output), { recursive: true });
  execFileSync(
    findChrome(),
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--no-pdf-header-footer',
      '--allow-file-access-from-files',
      `--print-to-pdf=${output}`,
      pathToFileURL(htmlFile).href,
    ],
    { stdio: 'inherit' },
  );
  console.log(`PDF generado: ${output}`);
}

main();
