export type BuildVideoPromptInput = {
  brief: string;
  caption?: string;
  hashtags?: string[];
  referenceText?: string;
};

/** Prompt corto vertical 9:16 para modelos text/image-to-video. */
export function buildVideoPrompt(input: BuildVideoPromptInput): string {
  const parts: string[] = [
    'Vertical 9:16 social media Reel, cinematic motion, natural lighting.',
    `Scene: ${input.brief.trim()}`,
  ];
  if (input.caption?.trim()) {
    parts.push(`Message theme: ${input.caption.trim()}`);
  }
  if (input.hashtags?.length) {
    parts.push(`Hashtags context: ${input.hashtags.join(' ')}`);
  }
  if (input.referenceText?.trim()) {
    parts.push(`Reference notes: ${input.referenceText.trim().slice(0, 800)}`);
  }
  parts.push('[Slow push in, subtle camera motion]');
  return parts.join('\n').slice(0, 1400);
}
