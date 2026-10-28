/** La portada de feed usa position 0. La story vertical de AAB va aparte para no entrar al carrusel. */
export const SUPPLIED_STORY_POSITION = 100;

export function isSuppliedStoryAsset(asset: { type?: string; position?: number | null }): boolean {
  return asset.type === 'image' && (asset.position ?? 0) >= SUPPLIED_STORY_POSITION;
}
