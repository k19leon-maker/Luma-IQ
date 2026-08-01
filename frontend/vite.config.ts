import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const resilientProductionAssets = {
  name: 'resilient-production-assets',
  enforce: 'post' as const,
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
  const workerUrl = '/frontend-loader-sw-v9.js';
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (!event.data?.type?.startsWith('asset-loader-')) return;
    console.info('[LumaIQ asset loader]', JSON.stringify(event.data));
  });
  const registration = await navigator.serviceWorker.register(workerUrl, { scope: '/' });
  await registration.update();
  const isCurrentWorker = () => navigator.serviceWorker.controller?.scriptURL.includes(workerUrl);
  if (!isCurrentWorker()) {
    await navigator.serviceWorker.ready;
    if (!sessionStorage.getItem('lumaiq-asset-loader-reload')) {
      sessionStorage.setItem('lumaiq-asset-loader-reload', '1');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      location.reload();
      return;
    }
    throw new Error('Asset loader could not control the page');
  }
  sessionStorage.removeItem('lumaiq-asset-loader-reload');
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
