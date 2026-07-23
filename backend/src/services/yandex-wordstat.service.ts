import { env } from '../config/env';

const API_BASE = 'https://searchapi.api.cloud.yandex.net/v2/wordstat';

export type WordstatDevice = 'DEVICE_ALL' | 'DEVICE_DESKTOP' | 'DEVICE_PHONE' | 'DEVICE_TABLET';

export type WordstatPhrase = {
  phrase: string;
  count: string;
};

export type WordstatTopResponse = {
  totalCount: string;
  results?: WordstatPhrase[];
  associations?: WordstatPhrase[];
};

export type WordstatDynamicsPoint = {
  date: string;
  count: string;
  share: string;
};

export type WordstatDynamicsResponse = {
  results?: WordstatDynamicsPoint[];
};

export type WordstatRegionPoint = {
  region: string;
  count: string;
  share: string;
  affinityIndex: string;
};

export type WordstatRegionsResponse = {
  results?: WordstatRegionPoint[];
};

export class WordstatApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string | number,
  ) {
    super(message);
    this.name = 'WordstatApiError';
  }
}

function assertConfigured() {
  if (!env.YANDEX_SEARCH_API_KEY || !env.YANDEX_CLOUD_FOLDER_ID) {
    throw new Error('Wordstat is not configured: YANDEX_SEARCH_API_KEY and YANDEX_CLOUD_FOLDER_ID are required');
  }
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  assertConfigured();
  const response = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Api-Key ${env.YANDEX_SEARCH_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...body, folderId: env.YANDEX_CLOUD_FOLDER_ID }),
    signal: AbortSignal.timeout(30_000),
  });

  const payload = await response.json().catch(() => ({})) as {
    code?: string | number;
    message?: string;
  };

  if (!response.ok) {
    throw new WordstatApiError(
      payload.message || `Wordstat request failed with HTTP ${response.status}`,
      response.status,
      payload.code,
    );
  }

  return payload as T;
}

export const yandexWordstatService = {
  getTop(input: {
    phrase: string;
    numPhrases?: number;
    regions?: string[];
    devices?: WordstatDevice[];
  }) {
    return post<WordstatTopResponse>('topRequests', {
      phrase: input.phrase,
      numPhrases: input.numPhrases ?? env.WORDSTAT_TOP_PHRASES,
      regions: input.regions,
      devices: input.devices ?? ['DEVICE_ALL'],
    });
  },

  getDynamics(input: {
    phrase: string;
    fromDate: string;
    toDate: string;
    regions?: string[];
    devices?: WordstatDevice[];
  }) {
    return post<WordstatDynamicsResponse>('dynamics', {
      phrase: input.phrase,
      period: 'PERIOD_MONTHLY',
      fromDate: input.fromDate,
      toDate: input.toDate,
      regions: input.regions,
      devices: input.devices ?? ['DEVICE_ALL'],
    });
  },

  getRegionsDistribution(input: {
    phrase: string;
    devices?: WordstatDevice[];
  }) {
    return post<WordstatRegionsResponse>('regions', {
      phrase: input.phrase,
      region: 'REGION_ALL',
      devices: input.devices ?? ['DEVICE_ALL'],
    });
  },
};
