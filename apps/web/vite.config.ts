import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  base: './',
  esbuild: {
    // Strip noisy debug calls in prod builds. console.error / console.warn
    // are kept because the codebase uses them for legitimate error logging
    // (53 call sites across 11 files in src/).
    pure:
      mode === 'production'
        ? ['console.log', 'console.debug', 'console.info']
        : [],
    drop: mode === 'production' ? ['debugger'] : [],
  },
  build: {
    // Raised from 500: pages-clinical (18 258 lines) and pages-knowledge
    // are single source files — they cannot be split further by manualChunks
    // alone without source-level extraction. Suppress non-actionable warnings.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      // @cornerstonejs/* are optional heavy deps for the MRI 3-D viewer.
      // When not installed the dynamic import in pages-mri-analysis.js
      // catches the failure and falls back to NiiVue.
      external: [
        '@cornerstonejs/core',
        '@cornerstonejs/tools',
        '@cornerstonejs/nifti-volume-loader',
        '@cornerstonejs/streaming-image-volume-loader',
        '@icr/polyseg-wasm',
      ],
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
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
}));
