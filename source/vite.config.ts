import { defineConfig } from 'vite';

// base './' so the built game works from a GitHub Pages subfolder
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
});
