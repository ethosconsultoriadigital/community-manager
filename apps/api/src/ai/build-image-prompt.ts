import type { PlatformVisualPreset } from './platform-visual-presets';

/**
 * Construye el prompt para generación de imagen de redes sociales.
 * Prioriza fidelidad al brief, caption, referencia y presets por plataforma.
 */
export function buildImagePrompt(input: {
  brief: string;
  caption?: string;
  hashtags?: string[];
  referenceText?: string;
  platformPresets?: PlatformVisualPreset[];
}): string {
  const brief = input.brief.trim();
  const caption = input.caption?.trim() ?? '';
  const tags = (input.hashtags ?? []).map((t) => t.trim()).filter(Boolean);
  const presets = input.platformPresets ?? [];

  const parts = [
    'Create one social media visual creative.',
    'Follow the visual brief closely. Do not invent a different topic or brand.',
    'Prefer a clean, realistic or polished marketing look. Avoid watermarks and logos unless requested.',
    'Do not overlay long paragraphs of text; short headline text only if the brief asks for it.',
    `Visual brief: ${brief}`,
  ];

  for (const preset of presets) {
    parts.push(`Target platform ${preset.platform} (${preset.aspectRatio}): ${preset.promptHints.join(' ')}`);
  }

  if (input.referenceText?.trim()) {
    parts.push(
      `Reference material from user (match style/content when generating): ${input.referenceText.trim().slice(0, 2000)}`,
    );
  }

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
