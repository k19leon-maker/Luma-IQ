const CACHE_NAME = 'lumaiq-frontend-assets-v17';
const ASSET_ORIGIN = self.location.origin;
const ASSET_PREFIX = '/frontend-assets-v2/';
const SOURCE_ORIGIN = self.location.origin;
const MAX_ATTEMPTS = 5;

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

async function fetchPart(url, expectedSize) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(`${url}?assetVersion=16&retry=${attempt}`, {
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Part request failed with HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength !== expectedSize) {
        throw new Error(`Asset part has invalid size: ${buffer.byteLength} instead of ${expectedSize}`);
      }
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
  const metadataResponse = await fetch(`${SOURCE_ORIGIN}${pathname}.parts.json?assetVersion=17`, {
    cache: 'no-store',
    credentials: 'omit',
  });
  if (!metadataResponse.ok) throw new Error(`Asset metadata failed with HTTP ${metadataResponse.status}`);
  const { parts, partSize, totalSize, contentType } = await metadataResponse.json();
  if (!Number.isInteger(parts) || parts < 1 || !Number.isInteger(partSize) || partSize < 1
    || !Number.isInteger(totalSize) || totalSize < 1) {
    throw new Error('Asset metadata is invalid');
  }
  await notifyClients({ type: 'asset-loader-start', path: new URL(request.url).pathname, totalSize });
  const chunks = [];
  let loaded = 0;
  for (let index = 0; index < parts; index += 1) {
    const partUrl = `${SOURCE_ORIGIN}${pathname}.parts/${String(index).padStart(4, '0')}`;
    const expectedSize = Math.min(partSize, totalSize - index * partSize);
    const buffer = await fetchPart(partUrl, expectedSize);
    chunks.push(buffer);
    loaded += buffer.byteLength;
    await notifyClients({
      type: 'asset-loader-progress',
      path: new URL(request.url).pathname,
      loaded,
      totalSize,
    });
  }

  const response = new Response(new Blob(chunks, { type: contentType }), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(totalSize),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
  await cache.put(request.url, response.clone());
  return response;
}

let assetQueue = Promise.resolve();

function queueAsset(request) {
  const task = assetQueue.then(() => fetchInChunks(request));
  assetQueue = task.then(() => undefined, () => undefined);
  return task;
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== ASSET_ORIGIN || !url.pathname.startsWith(ASSET_PREFIX)) return;
  event.respondWith(queueAsset(event.request).catch(async (error) => {
    await notifyClients({
      type: 'asset-loader-error',
      path: url.pathname,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }));
});
