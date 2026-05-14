/**
 * Enhanced Vitest Configuration — DeepSynaps Protocol Studio (Frontend)
 * ====================================================================
 * Replaces the minimal starter config with full coverage enforcement,
 intelligent exclusion patterns, and test-environment setup.
 *
 * Goals (Phase 2 coverage initiative):
 *   - Lift frontend coverage from 25/60/30 → 90/90/90 (lines/branches/functions)
 *   - Provide fast feedback loop for TDD (< 30 s per module)
 *   - Exclude generated/demo/synthetic code that skews metrics
 *   - Integrate with CI via c8/v8 JSON + lcov reporters
 *
 * See docs/testing/frontend-testing-guide.md for authoring patterns.
 */

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],

  test: {
    // ------------------------------------------------------------------
    // Environment
    // ------------------------------------------------------------------
    environment: "jsdom",               // DOM APIs for React Testing Library
    globals: true,                       // expect / describe / it without imports
    setupFiles: ["src/__tests__/setup.ts"],

    // ------------------------------------------------------------------
    // Discovery
    // ------------------------------------------------------------------
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "src/**/*.spec.ts",
      "src/**/*.spec.tsx",
    ],
    exclude: [
      "node_modules",
      "dist",
      "build",
      "**/*.stories.tsx",
      "**/*.stories.ts",
      "**/__snapshots__/**",
      "e2e/**",
      "playwright-report/**",
      "test-results/**",
      "src/studio/**",                   // 3-D / WebGL viewer: tested via E2E
    ],

    // ------------------------------------------------------------------
    // Timing & Parallelism
    // ------------------------------------------------------------------
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: false,
        maxThreads: 4,
        minThreads: 1,
      },
    },

    // ------------------------------------------------------------------
    // Coverage (v8 provider via c8 semantics)
    // ------------------------------------------------------------------
    coverage: {
      provider: "v8",
      reporter: [
        ["text", { maxCols: 120 }],
        ["text-summary"],
        ["lcov", { projectRoot: __dirname }],
        ["json-summary", { file: "coverage-summary.json" }],
        ["html", { subdir: "htmlcov" }],
      ],
      reportsDirectory: "./coverage",

      // ── Thresholds: 90 % gate ──────────────────────────────────────
      // These are the Phase 2 targets. CI (frontend-coverage.yml) fails
      // the build when any metric falls below these values.
      thresholds: {
        lines: 90,
        branches: 90,
        functions: 90,
        statements: 90,
      },

      // ── Exclusions: generated / demo / non-testable code ───────────
      // Any file matching these patterns is omitted from the denominator,
      // which makes the 90 % target achievable without testing glue code.
      exclude: [
        // Config & build
        "*.config.*",
        "*.d.ts",
        "vite-env.d.ts",
        // Test infrastructure
        "**/__tests__/**",
        "**/__fixtures__/**",
        "**/__mocks__/**",
        "**/tests/**",
        "**/*.test.*",
        "**/*.spec.*",
        // Generated code
        "**/_gen_*.ts",
        "**/_gen_*.js",
        "**/generated/**",
        "packages/api-client/src/openapi-types.ts",
        // Demo / synthetic data fixtures (not production logic)
        "**/demo-fixtures/**",
        "**/demo-*.js",
        "**/demo-*.ts",
        "**/mockData.js",
        "**/mockData.ts",
        // Stories (tested via interaction tests if at all)
        "**/*.stories.tsx",
        "**/*.stories.ts",
        // Studio: WebGL/3-D viewers require GPU context → E2E only
        "src/studio/**",
        // Entry points (thin bootstrap wrappers)
        "src/main.tsx",
        "src/studio/main.tsx",
        "src/studio/bootstrap.tsx",
        // i18n catalogue (static data, no logic)
        "src/i18n.js",
        "src/i18n.ts",
      ],

      // ── Per-directory overrides (commented until measured) ─────────
      // When a module is still below 90 %, add an override here so CI
      // can pass while that module is being worked. Remove overrides
      // as coverage improves — do NOT use as a permanent escape hatch.
      //
      // overrides: [
      //   { include: ["src/pages-patient/**"], thresholds: { lines: 70, branches: 70, functions: 70 } },
      // ],
    },

    // ------------------------------------------------------------------
    // Reporters
    // ------------------------------------------------------------------
    reporters: [
      "default",
      ["junit", { outputFile: "./coverage/junit.xml" }],
    ],

    // ------------------------------------------------------------------
    // Module resolution aliases (mirror vite.config.ts)
    // ------------------------------------------------------------------
    alias: {
      "@": resolve(__dirname, "./src"),
      "@deepsynaps/api-client": resolve(
        __dirname,
        "../../packages/api-client/src/index.ts"
      ),
    },
  },

  // ------------------------------------------------------------------
  // ESBuild (match production settings for accurate coverage)
  // ------------------------------------------------------------------
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
});
