import { SignJWT, importPKCS8 } from 'jose';

type ServiceAccountJson = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

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
    scope: SHEETS_SCOPE,
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
