import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // three.js alone is ~700 kB minified; warn only above that baseline.
    chunkSizeWarningLimit: 1000,
  },
});
