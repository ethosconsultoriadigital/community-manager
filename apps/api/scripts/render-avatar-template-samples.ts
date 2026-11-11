/**
 * Muestras locales de las plantillas de avatar (sin IA de pago).
 * Uso: npx tsx scripts/render-avatar-template-samples.ts <clip.mp4> <logo.png> <outDir> [colores dark,primary,accent] [web] [fuenteTitulo] [fuenteTexto] [prefijo]
 */
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  extractBrandColorsFromLogo,
  normalizeBrandFont,
  resolveBrandColors,
  type BrandColors,
} from '../src/ai/composition/brand-kit';
import { headlineFromCaption } from '../src/ai/composition/overlay-text';
import {
  buildAvatarAss,
  endCardSecondsFor,
  renderAvatarTemplateLayers,
  wordCuesFromLines,
  type DesignedAvatarTemplate,
} from '../src/ai/video-composition/avatar-template';
import { VideoCompositionService } from '../src/ai/video-composition/video-composition.service';

async function main() {
  const [
    clip,
    logoPath,
    outDir,
    colorsArg,
    website,
    fTitle,
    fBody,
    prefix = 'muestra',
  ] = process.argv.slice(2);
  if (!clip || !logoPath || !outDir) throw new Error('Faltan argumentos');
  await mkdir(outDir, { recursive: true });
  const logo = await readFile(logoPath);
  const [dark, primary, accent] = (colorsArg ?? '').split(',');
  const kit: Partial<BrandColors> = colorsArg ? { dark, primary, accent } : {};
  const colors = resolveBrandColors(
    kit,
    colorsArg ? null : await extractBrandColorsFromLogo(logo),
  );
  const svc = new VideoCompositionService();
  const caption =
    'Transforma tu negocio con nuestra consultoría digital. 🚀 Desde la estrategia hasta la implementación.';
  const mainSeconds = Math.min(10, await svc.probeClipDurationFromPath(clip));
  const subtitles = [
    {
      startSeconds: 0.15,
      endSeconds: 3.5,
      text: 'Transforma tu negocio con nuestra consultoría digital.',
    },
    {
      startSeconds: 3.7,
      endSeconds: 6.65,
      text: 'Contáctanos y crezcamos juntos en el mundo digital.',
    },
  ];
  for (const template of [
    'profesional',
    'circulo',
    'dividido',
  ] as DesignedAvatarTemplate[]) {
    const title = headlineFromCaption(caption, 60);
    const fontTitle = normalizeBrandFont(fTitle);
    const fontBody = normalizeBrandFont(fBody);
    const layers = await renderAvatarTemplateLayers({
      template,
      colors,
      logo,
      title,
      website,
      fontTitle,
      fontBody,
    });
    const endCardSeconds = endCardSecondsFor(mainSeconds, 10);
    const ass = buildAvatarAss({
      template,
      colors,
      fontTitle,
      fontBody,
      titleLines: layers.titleLines,
      titleSize: layers.titleSize,
      website,
      words: wordCuesFromLines(subtitles),
      mainSeconds,
      endCardSeconds,
    });
    const t0 = Date.now();
    const out = await svc.composeAvatarTemplate({
      clipPath: clip,
      layers,
      ass,
      mainSeconds,
      endCardSeconds,
      withMusic: true,
    });
    const dest = join(outDir, `${prefix}_${template}.mp4`);
    await copyFile(out.outPath!, dest);
    await svc.cleanupWorkDir(out.workDir);
    console.log(
      dest,
      out.durationSeconds,
      `${Date.now() - t0} ms`,
      JSON.stringify(colors),
    );
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
