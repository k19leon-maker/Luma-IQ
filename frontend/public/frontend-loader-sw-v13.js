const CACHE_NAME = 'lumaiq-frontend-assets-v13';
const ASSET_ORIGIN = self.location.origin;
const ASSET_PREFIX = '/frontend-assets-v2/';
const SOURCE_ORIGIN = self.location.origin;
const BATCH_SIZE = 1;
const MAX_ATTEMPTS = 3;

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

async function fetchPart(url) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, {
        mode: 'cors',
        credentials: 'omit',
        cache: 'force-cache',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Part request failed with HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      if (!buffer.byteLength) throw new Error('Asset part is empty');
      return buffer;
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

  const pathname = new URL(request.url).pathname;
  const metadataResponse = await fetch(`${SOURCE_ORIGIN}${pathname}.parts.json`, {
    cache: 'force-cache',
    credentials: 'omit',
  });
  if (!metadataResponse.ok) throw new Error(`Asset metadata failed with HTTP ${metadataResponse.status}`);
  const { parts, totalSize, contentType } = await metadataResponse.json();
  if (!Number.isInteger(parts) || parts < 1 || !Number.isInteger(totalSize) || totalSize < 1) {
    throw new Error('Asset metadata is invalid');
  }
  await notifyClients({ type: 'asset-loader-start', path: new URL(request.url).pathname, totalSize });
  const stream = new ReadableStream({
    start(controller) {
      (async () => {
        try {
          let loaded = 0;
          for (let offset = 0; offset < parts; offset += BATCH_SIZE) {
            const jobs = [];
            for (let index = 0; index < BATCH_SIZE; index += 1) {
              const partIndex = offset + index;
              if (partIndex >= parts) break;
              const partUrl = `${SOURCE_ORIGIN}${pathname}.parts/${String(partIndex).padStart(4, '0')}`;
              jobs.push(fetchPart(partUrl));
            }
            const batch = await Promise.all(jobs);
            batch.forEach((buffer) => {
              loaded += buffer.byteLength;
              controller.enqueue(new Uint8Array(buffer));
            });
            await notifyClients({
              type: 'asset-loader-progress',
              path: new URL(request.url).pathname,
              loaded,
              totalSize,
            });
          }
          controller.close();
        } catch (error) {
          await notifyClients({
            type: 'asset-loader-error',
            path: new URL(request.url).pathname,
            message: error instanceof Error ? error.message : String(error),
          });
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
