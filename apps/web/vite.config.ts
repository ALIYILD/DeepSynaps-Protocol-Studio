import { defineConfig } from "vite";

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 300,
    rollupOptions: {
      output: {
        manualChunks: {
          // Keep api/auth/helpers together as a 'core' chunk
          core: [
            "./src/api.js",
            "./src/auth.js",
            "./src/helpers.js",
            "./src/constants.js",
            "./src/i18n.js",
          ],
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
});
