/** Parte el texto en líneas para overlay en story 9:16. */
export function wrapStoryCaption(
  text: string,
  maxLines = 4,
  maxCharsPerLine = 38,
): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const words = normalized.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word.length > maxCharsPerLine ? `${word.slice(0, maxCharsPerLine - 1)}…` : word;
    if (lines.length >= maxLines) break;
  }

  if (lines.length < maxLines && current) lines.push(current);
  return lines.slice(0, maxLines);
}

export function escapeSvgText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildStoryCaptionSvg(lines: string[], width: number, height: number): string {
  const lineHeight = 44;
  const startY = 72;
  const tspans = lines
    .map((line, index) => {
      const y = startY + index * lineHeight;
      return `<tspan x="48" y="${y}">${escapeSvgText(line)}</tspan>`;
    })
    .join('');

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#111827" opacity="0.88"/>
  <text font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="600" fill="#ffffff">${tspans}</text>
</svg>`;
}
