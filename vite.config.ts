import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true,
    // Prefer 5288 so Cloud Agent port-forward does not collide with a local Vite on 5173
    // (opening localhost:5173 in CursorBrowser then hits the wrong process → blank/404).
    port: 5288,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
  },
});
