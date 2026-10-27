import { SignJWT, importPKCS8 } from 'jose';

type ServiceAccountJson = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

/**
 * spreadsheets (lectura y escritura) para poder marcar estado_redes en AAB.
 * La lectura de RadarMex sigue igual: el permiso real lo da el share del Sheet.
 * drive.readonly baja la portada (imagen_aab_url) a R2.
 */
export const GOOGLE_API_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
].join(' ');

export function parseServiceAccountJson(raw: string): ServiceAccountJson {
  const parsed = JSON.parse(raw) as ServiceAccountJson;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON inválido: faltan client_email o private_key');
  }
  return parsed;
}

export async function getGoogleAccessToken(sa: ServiceAccountJson): Promise<string> {
  const key = await importPKCS8(sa.private_key.replace(/\\n/g, '\n'), 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({
    scope: GOOGLE_API_SCOPES,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(sa.token_uri ?? 'https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const res = await fetch(sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(`No se pudo obtener token Google: ${json.error ?? res.status}`);
  }
  return json.access_token;
}

export async function fetchSpreadsheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
): Promise<string[][]> {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
  );
  url.searchParams.set('valueRenderOption', 'UNFORMATTED_VALUE');
  url.searchParams.set('dateTimeRenderOption', 'FORMATTED_STRING');

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as { values?: string[][]; error?: { message?: string } };
  if (!res.ok) {
    throw new Error(json.error?.message ?? `Sheets API HTTP ${res.status}`);
  }
  return (json.values ?? []).map((row) => row.map((c) => String(c ?? '')));
}

export async function resolveSheetTitleByGid(
  accessToken: string,
  spreadsheetId: string,
  gid: string,
): Promise<string> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as {
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message ?? `Sheets metadata HTTP ${res.status}`);
  }
  const want = Number(gid);
  const match = json.sheets?.find((s) => s.properties?.sheetId === want);
  const title = match?.properties?.title;
  if (!title) {
    throw new Error(`No se encontró pestaña con gid=${gid}`);
  }
  return title;
}

/** Nombre de pestaña: sheetName, si no gid, si no Sheet1. Igual que la ingesta. */
export async function resolveSheetTitle(
  accessToken: string,
  spreadsheetId: string,
  config: Record<string, unknown>,
): Promise<string> {
  let sheetTitle = typeof config.sheetName === 'string' ? config.sheetName.trim() : '';
  const gid = config.gid != null ? String(config.gid).trim() : '';
  if (!sheetTitle && gid) {
    sheetTitle = await resolveSheetTitleByGid(accessToken, spreadsheetId, gid);
  }
  if (!sheetTitle) sheetTitle = 'Sheet1';
  return sheetTitle;
}

export async function batchUpdateSheetValues(
  accessToken: string,
  spreadsheetId: string,
  data: Array<{ range: string; values: string[][] }>,
): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ valueInputOption: 'RAW', data }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(json.error?.message ?? `Sheets update HTTP ${res.status}`);
  }
}

export async function downloadDriveFile(
  accessToken: string,
  fileId: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const metaUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=mimeType,name`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const meta = (await metaRes.json()) as { mimeType?: string; error?: { message?: string } };
  if (!metaRes.ok) {
    throw new Error(meta.error?.message ?? `Drive metadata HTTP ${metaRes.status}`);
  }
  const mimeType = meta.mimeType ?? '';
  if (!mimeType.startsWith('image/')) {
    throw new Error(`El archivo de Drive no es imagen (${mimeType || 'sin tipo'})`);
  }

  const mediaUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
  const mediaRes = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!mediaRes.ok) {
    throw new Error(`Drive media HTTP ${mediaRes.status}`);
  }
  const buffer = Buffer.from(await mediaRes.arrayBuffer());
  if (buffer.length < 100) {
    throw new Error('Imagen vacía o demasiado pequeña');
  }
  return { buffer, mimeType };
}
