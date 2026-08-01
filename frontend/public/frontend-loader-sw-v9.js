const CACHE_NAME = 'lumaiq-frontend-assets-v9';
const ASSET_ORIGIN = self.location.origin;
const ASSET_PREFIX = '/frontend-assets-v2/';
const SOURCE_ORIGIN = self.location.origin;
const CHUNK_SIZE = 8192;
const BATCH_SIZE = 1;
const MAX_ATTEMPTS = 4;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith('lumaiq-frontend-assets-') && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function notifyClients(payload) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  windows.forEach((client) => client.postMessage(payload));
}

async function fetchRange(url, start, end) {
  const sourceUrl = `${SOURCE_ORIGIN}${new URL(url).pathname}`;
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(sourceUrl, {
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
        headers: { Range: `bytes=${start}-${end}` },
      });
      if (response.status !== 206) {
        throw new Error(`Expected HTTP 206, received ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      const expectedSize = end - start + 1;
      if (buffer.byteLength !== expectedSize) {
        throw new Error(`Incomplete range: expected ${expectedSize}, received ${buffer.byteLength}`);
      }
      return {
        buffer,
        contentRange: response.headers.get('Content-Range'),
        contentType: response.headers.get('Content-Type'),
      };
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 250));
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function fetchInChunks(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request.url);
  if (cached) return cached;

  const firstResponse = await fetchRange(request.url, 0, CHUNK_SIZE - 1);
  const contentRange = firstResponse.contentRange;
  const match = contentRange && contentRange.match(/bytes 0-\d+\/(\d+)/);
  if (!match) throw new Error('Content-Range is missing');

  const totalSize = Number(match[1]);
  const contentType = firstResponse.contentType || 'application/octet-stream';
  await notifyClients({ type: 'asset-loader-start', path: new URL(request.url).pathname, totalSize });
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(firstResponse.buffer));
      (async () => {
        try {
          for (let offset = CHUNK_SIZE; offset < totalSize; offset += CHUNK_SIZE * BATCH_SIZE) {
            const jobs = [];
            for (let index = 0; index < BATCH_SIZE; index += 1) {
              const start = offset + index * CHUNK_SIZE;
              if (start >= totalSize) break;
              const end = Math.min(start + CHUNK_SIZE - 1, totalSize - 1);
              jobs.push(fetchRange(request.url, start, end));
            }
            const batch = await Promise.all(jobs);
            batch.forEach(({ buffer }) => controller.enqueue(new Uint8Array(buffer)));
            await notifyClients({
              type: 'asset-loader-progress',
              path: new URL(request.url).pathname,
              loaded: Math.min(offset + CHUNK_SIZE * BATCH_SIZE, totalSize),
              totalSize,
            });
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      })();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(totalSize),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== ASSET_ORIGIN || !url.pathname.startsWith(ASSET_PREFIX)) return;
  event.respondWith(fetchInChunks(event.request).catch(async (error) => {
    await notifyClients({
      type: 'asset-loader-error',
      path: url.pathname,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }));
});
