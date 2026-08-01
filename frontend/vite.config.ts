import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const productionAssetBase = 'https://project-pwjyw-pi.vercel.app/';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? productionAssetBase : '/',
  plugins: [tailwindcss(), react()],
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
