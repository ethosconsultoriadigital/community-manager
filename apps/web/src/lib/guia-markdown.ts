/**
 * Mini-renderizador de Markdown para la Guía (docs/guia/guia.md).
 * Sin dependencias: lo usan la página /guia (en build) y scripts/guia-pdf.ts.
 * Soporta: # / ## / ### con {#id}, párrafos, listas (- y 1.), sublistas con 3 espacios,
 * tablas con |, citas (>) como recuadro de nota, **negrita**, `código` y [enlaces](url).
 */

export type GuiaHeading = { id: string; title: string; level: 2 | 3 };

export type GuiaSection = {
  id: string;
  title: string;
  /** Subtítulos (###) dentro de la sección, para el índice. */
  children: GuiaHeading[];
  /** HTML de la sección completa (incluye su <h2>). */
  html: string;
  /** Texto plano en minúsculas y sin acentos, para el buscador. */
  searchText: string;
};

export type GuiaDocument = {
  title: string;
  introHtml: string;
  sections: GuiaSection[];
};

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function slugify(text: string): string {
  return normalizeForSearch(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function renderInline(raw: string): string {
  let out = '';
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    out += escapeHtml(raw.slice(last, m.index));
    const tok = m[0];
    if (m[1]) {
      out += `<code>${escapeHtml(tok.slice(1, -1))}</code>`;
    } else if (m[2]) {
      out += `<strong>${renderInline(tok.slice(2, -2))}</strong>`;
    } else {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
      const label = lm ? lm[1] : tok;
      const href = lm ? lm[2] : '#';
      const safeHref = /^(https?:|mailto:|\/|#)/.test(href) ? href : '#';
      const external = /^https?:/.test(safeHref);
      out += `<a href="${escapeHtml(safeHref)}"${
        external ? ' target="_blank" rel="noopener noreferrer"' : ''
      }>${renderInline(label)}</a>`;
    }
    last = m.index + tok.length;
  }
  out += escapeHtml(raw.slice(last));
  return out;
}

function stripInline(raw: string): string {
  return raw
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function parseHeading(
  line: string,
): { level: number; title: string; id: string } | null {
  const m = /^(#{1,4})\s+(.*?)\s*(?:\{#([a-z0-9-]+)\})?\s*$/.exec(line);
  if (!m) return null;
  const title = m[2];
  return { level: m[1].length, title, id: m[3] ?? slugify(stripInline(title)) };
}

type ListItem = { text: string; children: ListItem[]; ordered: boolean };

function renderList(items: ListItem[], ordered: boolean): string {
  const tag = ordered ? 'ol' : 'ul';
  const body = items
    .map((it) => {
      const sub = it.children.length
        ? renderList(it.children, it.children[0].ordered)
        : '';
      return `<li>${renderInline(it.text)}${sub}</li>`;
    })
    .join('');
  return `<${tag}>${body}</${tag}>`;
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/** Convierte un bloque de líneas Markdown (sin encabezados ##) a HTML. */
function renderBlocks(lines: string[]): string {
  const html: string[] = [];
  let i = 0;
  const listRe = /^(\s*)(-|\d+\.)\s+(.*)$/;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = parseHeading(line);
    if (h && h.level >= 3) {
      const tag = h.level === 3 ? 'h3' : 'h4';
      html.push(`<${tag} id="${h.id}">${renderInline(h.title)}</${tag}>`);
      i++;
      continue;
    }
    if (line.startsWith('>')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      html.push(`<blockquote>${renderBlocks(buf)}</blockquote>`);
      continue;
    }
    if (line.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      const [head, maybeSep, ...rest] = rows;
      const hasSep =
        maybeSep && maybeSep.every((c) => /^:?-{2,}:?$/.test(c) || c === '---');
      const bodyRows = hasSep ? rest : rows.slice(1);
      html.push(
        `<div class="guia-table"><table><thead><tr>${head
          .map((c) => `<th>${renderInline(c)}</th>`)
          .join('')}</tr></thead><tbody>${bodyRows
          .map(
            (r) => `<tr>${r.map((c) => `<td>${renderInline(c)}</td>`).join('')}</tr>`,
          )
          .join('')}</tbody></table></div>`,
      );
      continue;
    }
    if (listRe.test(line)) {
      const root: ListItem[] = [];
      let rootOrdered = false;
      while (i < lines.length && listRe.test(lines[i])) {
        const m = listRe.exec(lines[i])!;
        const indent = m[1].length;
        const ordered = m[2] !== '-';
        const item: ListItem = { text: m[3], children: [], ordered };
        if (indent >= 2 && root.length) {
          root[root.length - 1].children.push(item);
        } else {
          if (!root.length) rootOrdered = ordered;
          root.push(item);
        }
        i++;
      }
      html.push(renderList(root, rootOrdered));
      continue;
    }
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith('>') &&
      !lines[i].trim().startsWith('|') &&
      !listRe.test(lines[i]) &&
      !parseHeading(lines[i])
    ) {
      buf.push(lines[i].trim());
      i++;
    }
    if (buf.length) html.push(`<p>${renderInline(buf.join(' '))}</p>`);
    else i++;
  }
  return html.join('\n');
}

/** Parte el Markdown de la guía en secciones (una por cada ##). */
export function parseGuia(markdown: string): GuiaDocument {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let title = 'Guía';
  const intro: string[] = [];
  const raw: { id: string; title: string; lines: string[] }[] = [];
  for (const line of lines) {
    const h = parseHeading(line);
    if (h?.level === 1) {
      title = stripInline(h.title);
      continue;
    }
    if (h?.level === 2) {
      raw.push({ id: h.id, title: h.title, lines: [] });
      continue;
    }
    if (raw.length) raw[raw.length - 1].lines.push(line);
    else intro.push(line);
  }
  const sections: GuiaSection[] = raw.map((s) => {
    const children: GuiaHeading[] = [];
    for (const l of s.lines) {
      const h = parseHeading(l);
      if (h?.level === 3)
        children.push({ id: h.id, title: stripInline(h.title), level: 3 });
    }
    return {
      id: s.id,
      title: stripInline(s.title),
      children,
      html: `<h2 id="${s.id}">${renderInline(s.title)}</h2>\n${renderBlocks(s.lines)}`,
      searchText: normalizeForSearch(
        stripInline([s.title, ...s.lines].join(' ').replace(/[#|>{}]/g, ' ')),
      ),
    };
  });
  return { title, introHtml: renderBlocks(intro), sections };
}
