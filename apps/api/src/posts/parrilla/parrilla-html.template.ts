export type ParrillaPostView = {
  index: number;
  total: number;
  clientName: string;
  caption: string;
  hashtags: string[];
  destinations: string[];
  formatLabel: string;
  statusLabel: string;
  placeName?: string | null;
  shortId: string;
  /** data URL o vacío */
  imageDataUrl: string | null;
  isVideo: boolean;
  createdLabel: string;
};

export type ParrillaHtmlInput = {
  clientName: string;
  count: number;
  generatedAtLabel: string;
  periodLabel: string;
  logoDataUrl: string | null;
  posts: ParrillaPostView[];
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function postPage(post: ParrillaPostView): string {
  const hashtags =
    post.hashtags.length > 0
      ? `<p class="hashtags">${escapeHtml(post.hashtags.join(' '))}</p>`
      : '';
  const place = post.placeName
    ? `<span class="chip">Ubicación: ${escapeHtml(post.placeName)}</span>`
    : '';

  let mediaBlock: string;
  if (post.imageDataUrl) {
    mediaBlock = `<div class="media"><img src="${post.imageDataUrl}" alt="Vista previa" /></div>`;
  } else if (post.isVideo) {
    mediaBlock = `<div class="media media-placeholder">Video · vista previa no incluida</div>`;
  } else {
    mediaBlock = `<div class="media media-placeholder">Sin imagen</div>`;
  }

  return `
  <section class="page piece">
    <header class="piece-top">
      <div>
        <p class="eyebrow">${escapeHtml(post.clientName)} · Pieza ${post.index} de ${post.total}</p>
        <h2>${escapeHtml(post.createdLabel)}</h2>
      </div>
      <div class="brand-mini">Ethos</div>
    </header>

    <div class="chips">
      <span class="chip chip-brand">${escapeHtml(post.formatLabel)}</span>
      <span class="chip">${escapeHtml(post.statusLabel)}</span>
      ${place}
      <span class="chip muted">ID ${escapeHtml(post.shortId)}</span>
    </div>

    <p class="destinations"><strong>Destinos:</strong> ${
      post.destinations.length
        ? escapeHtml(post.destinations.join(' · '))
        : 'Sin destinos'
    }</p>

    ${mediaBlock}

    <div class="caption-block">
      <h3>Texto de publicación</h3>
      <p class="caption">${escapeHtml(post.caption)}</p>
      ${hashtags}
    </div>

    <div class="decision">
      <h3>Decisión del revisor</h3>
      <label class="check"><span class="box"></span> Aprobar</label>
      <label class="check"><span class="box"></span> Rechazar / solicitar cambios</label>
      <p class="comments-label">Comentarios</p>
      <div class="lines">
        <div class="line"></div>
        <div class="line"></div>
      </div>
    </div>

    <footer class="piece-foot">
      Community Manager · Ethos Consultoría Digital · www.ethosconsultoriadigital.com
    </footer>
  </section>`;
}

/** HTML completo listo para Chromium → PDF (A4). */
export function buildParrillaHtml(input: ParrillaHtmlInput): string {
  const logo = input.logoDataUrl
    ? `<img class="cover-logo" src="${input.logoDataUrl}" alt="Ethos" />`
    : `<div class="cover-logo-text">Ethos Consultoría Digital</div>`;

  const pages = input.posts.map(postPage).join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Parrilla de contenido — ${escapeHtml(input.clientName)}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
      color: #0a1628;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 18mm 16mm 16mm;
      page-break-after: always;
      position: relative;
    }
    .page:last-child { page-break-after: auto; }

    /* Portada */
    .cover {
      background:
        radial-gradient(120% 80% at 100% 0%, rgba(24,119,242,0.18), transparent 55%),
        linear-gradient(165deg, #f7faff 0%, #ffffff 45%, #eef4fc 100%);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .cover-logo { width: 200px; height: auto; }
    .cover-logo-text {
      font-size: 18px;
      font-weight: 700;
      color: #1877f2;
      letter-spacing: 0.02em;
    }
    .cover-hero { text-align: center; margin-top: 48mm; }
    .cover-kicker {
      display: inline-block;
      background: #e8f1fc;
      color: #0d65d9;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 8px 14px;
      border-radius: 999px;
      margin-bottom: 18px;
    }
    .cover-hero h1 {
      margin: 0;
      font-size: 42px;
      line-height: 1.05;
      letter-spacing: -0.02em;
      color: #0a1628;
    }
    .cover-hero .sub {
      margin: 14px 0 0;
      font-size: 16px;
      color: #1877f2;
      font-weight: 600;
    }
    .cover-meta {
      margin: 28px auto 0;
      max-width: 420px;
      background: #fff;
      border: 1px solid #e4e6eb;
      border-radius: 16px;
      padding: 18px 22px;
      box-shadow: 0 10px 30px rgba(10, 22, 40, 0.06);
    }
    .cover-meta .client {
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 6px;
    }
    .cover-meta .period, .cover-meta .count {
      margin: 0;
      font-size: 13px;
      color: #5b5e63;
    }
    .cover-note {
      margin: 22px auto 0;
      max-width: 460px;
      font-size: 12px;
      line-height: 1.5;
      color: #5b5e63;
      text-align: center;
    }
    .cover-foot {
      text-align: center;
      font-size: 11px;
      color: #8a8d91;
    }

    /* Pieza */
    .piece-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      border-bottom: 2px solid #1877f2;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .eyebrow {
      margin: 0 0 4px;
      font-size: 11px;
      color: #5b5e63;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .piece-top h2 {
      margin: 0;
      font-size: 22px;
      line-height: 1.2;
    }
    .brand-mini {
      font-size: 12px;
      font-weight: 700;
      color: #1877f2;
      border: 1px solid #cfe2ff;
      background: #e8f1fc;
      padding: 6px 10px;
      border-radius: 999px;
    }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
    .chip {
      display: inline-block;
      font-size: 11px;
      padding: 5px 10px;
      border-radius: 999px;
      background: #f0f2f5;
      color: #1c1e21;
      border: 1px solid #e4e6eb;
    }
    .chip-brand { background: #e8f1fc; color: #0d65d9; border-color: #cfe2ff; font-weight: 600; }
    .chip.muted { color: #5b5e63; }
    .destinations { font-size: 12px; color: #374151; margin: 0 0 14px; }
    .media {
      width: 100%;
      max-height: 88mm;
      border-radius: 14px;
      overflow: hidden;
      border: 1px solid #e4e6eb;
      background: #f0f2f5;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 14px;
    }
    .media img {
      width: 100%;
      max-height: 88mm;
      object-fit: contain;
      display: block;
      background: #fff;
    }
    .media-placeholder {
      min-height: 36mm;
      color: #5b5e63;
      font-size: 13px;
    }
    .caption-block {
      background: #fff;
      border: 1px solid #e4e6eb;
      border-radius: 14px;
      padding: 14px 16px;
      margin-bottom: 14px;
    }
    .caption-block h3, .decision h3 {
      margin: 0 0 8px;
      font-size: 12px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #1877f2;
    }
    .caption {
      margin: 0;
      font-size: 13px;
      line-height: 1.55;
      white-space: pre-wrap;
      color: #1c1e21;
    }
    .hashtags {
      margin: 10px 0 0;
      font-size: 12px;
      color: #1877f2;
      font-weight: 600;
    }
    .decision {
      border: 1px solid #cfe2ff;
      background: linear-gradient(180deg, #f7faff 0%, #ffffff 100%);
      border-radius: 14px;
      padding: 14px 16px;
    }
    .check {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      margin: 8px 0;
      color: #1c1e21;
    }
    .box {
      width: 14px;
      height: 14px;
      border: 1.5px solid #5b5e63;
      border-radius: 3px;
      display: inline-block;
      background: #fff;
      flex: 0 0 14px;
    }
    .comments-label {
      margin: 12px 0 6px;
      font-size: 12px;
      color: #5b5e63;
    }
    .line {
      border-bottom: 1px solid #ccd0d5;
      height: 18px;
      margin-bottom: 6px;
    }
    .piece-foot {
      position: absolute;
      left: 16mm;
      right: 16mm;
      bottom: 10mm;
      font-size: 10px;
      color: #8a8d91;
      text-align: center;
      border-top: 1px solid #e4e6eb;
      padding-top: 8px;
    }
  </style>
</head>
<body>
  <section class="page cover">
    <div>${logo}</div>
    <div class="cover-hero">
      <div class="cover-kicker">Propuesta para aprobación</div>
      <h1>PARRILLA DE<br/>CONTENIDO</h1>
      <p class="sub">Community Manager · Ethos Consultoría Digital</p>
      <div class="cover-meta">
        <p class="client">${escapeHtml(input.clientName)}</p>
        <p class="period">${escapeHtml(input.periodLabel)}</p>
        <p class="count">${input.count} publicación${input.count === 1 ? '' : 'es'} · ${escapeHtml(input.generatedAtLabel)}</p>
      </div>
      <p class="cover-note">
        Documento para revisión offline. Marca en cada pieza si se aprueba o se rechaza;
        el community manager aplicará la decisión en el sistema.
      </p>
    </div>
    <div class="cover-foot">www.ethosconsultoriadigital.com</div>
  </section>
  ${pages}
</body>
</html>`;
}
