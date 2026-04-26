import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'assets/icons',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
