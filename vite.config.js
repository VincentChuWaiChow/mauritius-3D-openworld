import { defineConfig } from 'vite';

export default defineConfig({
  build: { rollupOptions: { input: { explorer: 'index.html', classic: 'classic.html' } } },
  base: '/mauritius-3D-openworld/',
});
