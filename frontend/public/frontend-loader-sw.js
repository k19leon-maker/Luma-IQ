const CACHE_NAME = 'lumaiq-frontend-assets-v1';
const ASSET_ORIGIN = 'https://api.lumaiq.ru';
const ASSET_PREFIX = '/frontend/';
const CHUNK_SIZE = 8192;
const BATCH_SIZE = 8;

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

async function fetchRange(url, start, end) {
  const response = await fetch(url, {
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
    headers: { Range: `bytes=${start}-${end}` },
  });
  if (response.status !== 206) {
    throw new Error(`Expected HTTP 206, received ${response.status}`);
  }
  return response;
}

async function fetchInChunks(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request.url);
  if (cached) return cached;

  const firstResponse = await fetchRange(request.url, 0, CHUNK_SIZE - 1);
  const contentRange = firstResponse.headers.get('Content-Range');
  const match = contentRange && contentRange.match(/bytes 0-\d+\/(\d+)/);
  if (!match) throw new Error('Content-Range is missing');

  const totalSize = Number(match[1]);
  const contentType = firstResponse.headers.get('Content-Type') || 'application/octet-stream';
  const chunks = new Array(Math.ceil(totalSize / CHUNK_SIZE));
  chunks[0] = await firstResponse.arrayBuffer();

  for (let offset = CHUNK_SIZE; offset < totalSize; offset += CHUNK_SIZE * BATCH_SIZE) {
    const jobs = [];
    for (let index = 0; index < BATCH_SIZE; index += 1) {
      const start = offset + index * CHUNK_SIZE;
      if (start >= totalSize) break;
      const end = Math.min(start + CHUNK_SIZE - 1, totalSize - 1);
      jobs.push(fetchRange(request.url, start, end).then(async (response) => ({
        index: Math.floor(start / CHUNK_SIZE),
        buffer: await response.arrayBuffer(),
      })));
    }
    const batch = await Promise.all(jobs);
    batch.forEach(({ index, buffer }) => { chunks[index] = buffer; });
  }

  const response = new Response(new Blob(chunks, { type: contentType }), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
  await cache.put(request.url, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== ASSET_ORIGIN || !url.pathname.startsWith(ASSET_PREFIX)) return;
  event.respondWith(fetchInChunks(event.request));
});
