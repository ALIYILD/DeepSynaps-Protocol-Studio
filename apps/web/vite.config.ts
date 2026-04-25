import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: './',
  assetsInclude: ['**/*.wasm'],
  worker: {
    format: 'es',
  },
  build: {
    // Raised from 500: pages-clinical (18 258 lines) and pages-knowledge
    // are single source files — they cannot be split further by manualChunks
    // alone without source-level extraction. Suppress non-actionable warnings.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // --- Shared runtime utilities (api, auth, helpers, i18n) ---
          if (
            id.includes("/api.js") ||
            id.includes("/auth.js") ||
            id.includes("/helpers.js") ||
            id.includes("/constants.js") ||
            id.includes("/i18n.js")
          ) {
            return "core";
          }

          // --- Heavy static data files → own chunk, cached separately ---
          if (
            id.includes("/protocols-data.js") ||
            id.includes("/handbooks-data.js") ||
            id.includes("/condition-packages.js")
          ) {
            return "ds-data";
          }

          // --- Registry definitions → own chunk ---
          if (id.includes("/registries.js") || id.includes("/registries/")) {
            return "ds-registries";
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8001",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:8001",
        changeOrigin: true,
      },
    },
  },
});
