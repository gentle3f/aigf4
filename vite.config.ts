import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  server: { open: true },
  build: { rollupOptions: { input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), generationPilot: fileURLToPath(new URL('./generation-pilot.html', import.meta.url)) } } },
});
