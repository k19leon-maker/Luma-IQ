import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const resilientProductionAssets = {
  name: 'resilient-production-assets',
  enforce: 'post' as const,
  generateBundle(_options: unknown, bundle: Record<string, any>) {
    const encoder = new TextEncoder();
    const partSize = 8192;
    for (const [fileName, output] of Object.entries(bundle)) {
      if (!fileName.startsWith('frontend-assets-v2/') || !/\.(?:js|css)$/.test(fileName)) continue;
      const source = output.type === 'chunk' ? output.code : output.source;
      const bytes = typeof source === 'string' ? encoder.encode(source) : new Uint8Array(source);
      const parts = Math.ceil(bytes.byteLength / partSize);
      for (let index = 0; index < parts; index += 1) {
        this.emitFile({
          type: 'asset',
          fileName: `${fileName}.parts/${String(index).padStart(4, '0')}`,
          source: bytes.slice(index * partSize, Math.min((index + 1) * partSize, bytes.byteLength)),
        });
      }
      this.emitFile({
        type: 'asset',
        fileName: `${fileName}.parts.json`,
        source: JSON.stringify({
          parts,
          partSize,
          totalSize: bytes.byteLength,
          contentType: fileName.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8',
        }),
      });
    }
  },
  transformIndexHtml: {
    order: 'post' as const,
    handler(html: string) {
      const scriptTag = html.match(
        /<script type="module" crossorigin src="(\/frontend-assets-v2\/index-[^"]+\.js)"><\/script>/,
      );
      const stylesheetTag = html.match(
        /<link rel="stylesheet" crossorigin href="(\/frontend-assets-v2\/index-[^"]+\.css)">/,
      );
      if (!scriptTag || !stylesheetTag) return html;

      const loader = `<script type="module">
const root = document.getElementById('root');
root.innerHTML = '<div style="min-height:100vh;display:grid;place-items:center;padding:24px;font:600 16px/1.5 Inter,Arial,sans-serif;color:#6f6a61;background:#fcfbf8">Загружаем Luma IQ...</div>';
async function boot() {
  if (!('serviceWorker' in navigator)) throw new Error('Service Worker is not supported');
  const workerUrl = '/frontend-loader-sw-v19.js';
  const assetCacheName = 'lumaiq-frontend-assets-v19';
  const assetSource = 'https://api.lumaiq.ru/frontend';
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (!event.data?.type?.startsWith('asset-loader-')) return;
    console.info('[LumaIQ asset loader]', JSON.stringify(event.data));
  });
  const registration = await navigator.serviceWorker.register(workerUrl, { scope: '/' });
  await registration.update();
  await navigator.serviceWorker.ready;
  const isCurrentWorker = () => navigator.serviceWorker.controller?.scriptURL.includes(workerUrl);
  if (!isCurrentWorker()) {
    await Promise.race([
      new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })),
      new Promise((resolve) => setTimeout(resolve, 10000)),
    ]);
  }
  if (!isCurrentWorker()) {
    location.reload();
    return;
  }
  async function fetchPart(url, expectedSize) {
    let lastError;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(url + '?assetVersion=19&retry=' + attempt, {
          cache: 'no-store',
          credentials: 'omit',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Asset part failed with HTTP ' + response.status);
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength !== expectedSize) throw new Error('Asset part has invalid size');
        return buffer;
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError;
  }
  async function preloadAsset(path) {
    const cache = await caches.open(assetCacheName);
    const requestUrl = new URL(path, location.origin).href;
    if (await cache.match(requestUrl)) return;
    const metadataResponse = await fetch(assetSource + path + '.parts.json?assetVersion=19', {
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!metadataResponse.ok) throw new Error('Asset metadata failed with HTTP ' + metadataResponse.status);
    const metadata = await metadataResponse.json();
    const chunks = [];
    let loaded = 0;
    for (let index = 0; index < metadata.parts; index += 1) {
      const expectedSize = Math.min(metadata.partSize, metadata.totalSize - index * metadata.partSize);
      const partUrl = assetSource + path + '.parts/' + String(index).padStart(4, '0');
      const buffer = await fetchPart(partUrl, expectedSize);
      chunks.push(buffer);
      loaded += buffer.byteLength;
      root.firstElementChild.textContent = 'Загружаем Luma IQ... ' + Math.round(loaded / metadata.totalSize * 100) + '%';
    }
    await cache.put(requestUrl, new Response(new Blob(chunks, { type: metadata.contentType }), {
      headers: {
        'Content-Type': metadata.contentType,
        'Content-Length': String(metadata.totalSize),
      },
    }));
  }
  await preloadAsset(${JSON.stringify(stylesheetTag[1])});
  await preloadAsset(${JSON.stringify(scriptTag[1])});
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = ${JSON.stringify(stylesheetTag[1])};
  document.head.append(stylesheet);
  await import(${JSON.stringify(scriptTag[1])});
}
boot().catch((error) => {
  console.error('[LumaIQ bootstrap]', error);
  root.innerHTML = '<div style="min-height:100vh;display:grid;place-items:center;padding:24px;text-align:center;font:600 16px/1.5 Inter,Arial,sans-serif;color:#6f6a61;background:#fcfbf8"><div>Не удалось загрузить Luma IQ.<br><button onclick="location.reload()" style="margin-top:16px;padding:12px 18px;border:1px solid #c8a04b;border-radius:8px;background:#c8a04b;font:inherit;cursor:pointer">Повторить</button></div></div>';
});
</script>`;

      return html
        .replace(stylesheetTag[0], '')
        .replace(scriptTag[0], loader);
    },
  },
};

export default defineConfig(({ command }) => ({
  base: '/',
  plugins: [tailwindcss(), react(), ...(command === 'build' ? [resilientProductionAssets] : [])],
  build: command === 'build' ? { assetsDir: 'frontend-assets-v2' } : undefined,
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
}));
