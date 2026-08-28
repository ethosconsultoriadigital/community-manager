/**
 * Construye el prompt para generación de imagen de redes sociales.
 * Prioriza fidelidad al brief y al caption del post.
 */
export function buildImagePrompt(input: {
  brief: string;
  caption?: string;
  hashtags?: string[];
}): string {
  const brief = input.brief.trim();
  const caption = input.caption?.trim() ?? '';
  const tags = (input.hashtags ?? []).map((t) => t.trim()).filter(Boolean);

  const parts = [
    'Create one square social media post image (instagram/facebook feed style).',
    'Follow the visual brief closely. Do not invent a different topic or brand.',
    'Prefer a clean, realistic or polished marketing look. Avoid watermarks and logos unless requested.',
    'Do not overlay long paragraphs of text; short headline text only if the brief asks for it.',
    `Visual brief: ${brief}`,
  ];

  if (caption) {
    parts.push(
      `The post caption (for subject/context — match this theme): ${caption.slice(0, 800)}`,
    );
  }
  if (tags.length > 0) {
    parts.push(`Related hashtags (context only, do not paint them): ${tags.join(' ')}`);
  }

  return parts.join('\n').slice(0, 3500);
}
