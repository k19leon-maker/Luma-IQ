import crypto from 'crypto';
import fs from 'fs';
import { env } from '../config/env';

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

function base64Url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function loadCredentials(): ServiceAccountCredentials {
  let raw = '';
  if (env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64) {
    raw = Buffer.from(env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64, 'base64').toString('utf8');
  } else if (env.GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE) {
    raw = fs.readFileSync(env.GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE, 'utf8');
  }

  if (!raw) {
    throw new Error(
      'Google Sheets is not configured: set GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE or GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64',
    );
  }

  const credentials = JSON.parse(raw) as Partial<ServiceAccountCredentials>;
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Google Sheets service account JSON is missing client_email or private_key');
  }
  return credentials as ServiceAccountCredentials;
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.accessToken;
  }

  const credentials = loadCredentials();
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = credentials.token_uri || 'https://oauth2.googleapis.com/token';
  const assertionHeader = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const assertionPayload = base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${assertionHeader}.${assertionPayload}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), credentials.private_key);
  const assertion = `${unsigned}.${base64Url(signature)}`;

  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json() as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || `Google OAuth failed with HTTP ${response.status}`);
  }

  tokenCache = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  };
  return payload.access_token;
}

async function sheetsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = await getAccessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.SEO_SPREADSHEET_ID}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({})) as {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(payload.error?.message || `Google Sheets request failed with HTTP ${response.status}`);
  }
  return payload as T;
}

function encodeRange(range: string): string {
  return encodeURIComponent(range);
}

export const googleSheetsService = {
  async getValues(range: string): Promise<string[][]> {
    const payload = await sheetsFetch<{ values?: unknown[][] }>(`/values/${encodeRange(range)}`);
    return (payload.values ?? []).map((row) => row.map((value) => String(value ?? '')));
  },

  async batchUpdateValues(data: Array<{ range: string; values: Array<Array<string | number>> }>) {
    if (!data.length) return;
    await sheetsFetch('/values:batchUpdate', {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data,
      }),
    });
  },
};
