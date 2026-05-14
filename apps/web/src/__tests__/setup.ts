/**
 * Test Environment Setup — DeepSynaps Protocol Studio (Frontend)
 * ==============================================================
 * Runs once before all test suites. Provides global mocks for browser
 * APIs that are unavailable in jsdom, plus test-data cleanup helpers.
 *
 * Import this via the `setupFiles` array in vitest.config.ts.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// ── Auto-cleanup DOM after each test ──────────────────────────────────
afterEach(() => {
  cleanup();
});

// ═══════════════════════════════════════════════════════════════════════
// window.matchMedia mock
// ═══════════════════════════════════════════════════════════════════════
// Required by Radix UI components and any responsive hooks that gate
 // rendering on breakpoint queries.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),        // deprecated
    removeListener: vi.fn(),     // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Helper to programmatically set breakpoint for responsive component tests
export function setMatchMedia(matches: boolean, query = "(min-width: 768px)") {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q === query ? matches : false,
    media: q,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// ═══════════════════════════════════════════════════════════════════════
// IntersectionObserver mock
// ═══════════════════════════════════════════════════════════════════════
// Used by lazy-loaded image galleries, virtualised tables, and
// scroll-triggered analytics.
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = "0px";
  readonly thresholds: ReadonlyArray<number> = [0];
  private _callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this._callback = callback;
  }

  observe(target: Element): void {
    // Immediately report the element as intersecting so lazy-loaded
    // content mounts without waiting for a scroll event.
    queueMicrotask(() => {
      this._callback(
        [
          {
            target,
            isIntersecting: true,
            intersectionRatio: 1,
            boundingClientRect: {} as DOMRectReadOnly,
            intersectionRect: {} as DOMRectReadOnly,
            rootBounds: null,
            time: Date.now(),
          },
        ],
        this
      );
    });
  }

  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

Object.defineProperty(window, "IntersectionObserver", {
  writable: true,
  value: MockIntersectionObserver,
});

// ═══════════════════════════════════════════════════════════════════════
// ResizeObserver mock
// ═══════════════════════════════════════════════════════════════════════
// Required by Plotly charts, responsive SVG viewers, and resizable
// split-pane layouts.
class MockResizeObserver implements ResizeObserver {
  private _callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this._callback = callback;
  }

  observe(target: Element): void {
    // Fire a single entry with plausible dimensions so charts can
    // compute their initial layout.
    queueMicrotask(() => {
      this._callback(
        [
          {
            target,
            contentRect: {
              x: 0,
              y: 0,
              width: 1024,
              height: 768,
              top: 0,
              right: 1024,
              bottom: 768,
              left: 0,
              toJSON() {
                return this;
              },
            } as DOMRectReadOnly,
            borderBoxSize: [
              { inlineSize: 1024, blockSize: 768 },
            ] as unknown as ReadonlyArray<ResizeObserverSize>,
            contentBoxSize: [
              { inlineSize: 1024, blockSize: 768 },
            ] as unknown as ReadonlyArray<ResizeObserverSize>,
            devicePixelContentBoxSize: [
              { inlineSize: 1024, blockSize: 768 },
            ] as unknown as ReadonlyArray<ResizeObserverSize>,
          } as ResizeObserverEntry,
        ],
        this
      );
    });
  }

  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: MockResizeObserver,
});

// ═══════════════════════════════════════════════════════════════════════
// Scroll helpers
// ═══════════════════════════════════════════════════════════════════════
window.scrollTo = vi.fn();
window.scrollBy = vi.fn();
Element.prototype.scrollIntoView = vi.fn();

// ═══════════════════════════════════════════════════════════════════════
// localStorage / sessionStorage mocks
// ═══════════════════════════════════════════════════════════════════════
// Each test gets a fresh, isolated store so token/auth state leaks
// cannot cross test boundaries.
const createMockStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = String(value);
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    // test-only helper to inspect current state
    _dump: () => ({ ...store }),
    _reset: () => {
      store = {};
    },
  };
};

const localStorageMock = createMockStorage();
const sessionStorageMock = createMockStorage();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});
Object.defineProperty(window, "sessionStorage", {
  value: sessionStorageMock,
});

// Reset storage before every test so auth state is deterministic.
import { beforeEach } from "vitest";
beforeEach(() => {
  localStorageMock._reset();
  sessionStorageMock._reset();
});

// ═══════════════════════════════════════════════════════════════════════
// console suppression in CI
// ═══════════════════════════════════════════════════════════════════════
// Keep the output clean when third-party libraries log deprecation
// warnings or Plotly/WebGL errors.
if (process.env.CI === "true") {
  const noop = () => {};
  const originalWarn = console.warn;
  const originalError = console.error;

  console.warn = (...args: unknown[]) => {
    const msg = args.join(" ");
    const suppressed = [
      "ReactDOMTestUtils.act",
      "componentWillReceiveProps",
      "plotly",
      "WebGL",
      "cornerstone",
    ];
    if (suppressed.some((s) => msg.includes(s))) return;
    originalWarn.apply(console, args);
  };

  console.error = (...args: unknown[]) => {
    const msg = args.join(" ");
    const suppressed = [
      "Not implemented: navigation",
      "WebGL warning",
      "plotly",
    ];
    if (suppressed.some((s) => msg.includes(s))) return;
    originalError.apply(console, args);
  };
}

// ═══════════════════════════════════════════════════════════════════════
// fetch mock helper
// ═══════════════════════════════════════════════════════════════════════
export function createMockFetch(
  responses: Map<string, unknown>
): typeof globalThis.fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [pattern, payload] of responses) {
      if (url.includes(pattern)) {
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return new Response(JSON.stringify({ error: "Not mocked" }), {
      status: 404,
    });
  }) as unknown as typeof globalThis.fetch;
}

// ═══════════════════════════════════════════════════════════════════════
// Mock API client helper (re-exported from test-utils for convenience)
 // ═══════════════════════════════════════════════════════════════════════
// See src/__tests__/utils/test-utils.tsx for full mock factories.
