// Thin typed fetch wrapper over the generated OpenAPI types.
//
// Design goals:
//   * Zero runtime dependencies (no openapi-fetch, no axios). Just `fetch`.
//   * Typed paths, methods, request bodies, query params, and responses
//     via the `paths` and `components` types in `./openapi-types.ts`.
//   * Mirrors the auth + 401 conventions used by `apps/web/src/api.js`
//     so it can run side-by-side with the legacy client during migration.
//
// This file is the FUTURE contract layer. The legacy `apps/web/src/api.js`
// remains the source of truth until each page is migrated. See README.md.

import type { paths, components } from './openapi-types';

// --------------------------------------------------------------------------
// Public type re-exports
// --------------------------------------------------------------------------
export type Paths = paths;
export type Schemas = components['schemas'];

type HttpMethod = 'get' | 'put' | 'post' | 'delete' | 'patch';

// Helpers that pick the relevant slice of the openapi `paths` tree for a
// given (path, method) pair. They intentionally return `never` when the
// combination doesn't exist so callers get a compile error.
export type PathsWithMethod<M extends HttpMethod> = {
  [P in keyof paths]: paths[P] extends { [K in M]: unknown } ? P : never;
}[keyof paths];

type Op<P extends keyof paths, M extends HttpMethod> = paths[P] extends Record<M, infer Operation>
  ? Operation
  : never;

type RequestBodyJson<P extends keyof paths, M extends HttpMethod> =
  Op<P, M> extends { requestBody: { content: { 'application/json': infer B } } } ? B :
  Op<P, M> extends { requestBody?: { content: { 'application/json': infer B } } } ? B | undefined :
  undefined;

type QueryParams<P extends keyof paths, M extends HttpMethod> =
  Op<P, M> extends { parameters: { query: infer Q } } ? Q :
  Op<P, M> extends { parameters?: { query?: infer Q } } ? Q | undefined :
  undefined;

type PathParams<P extends keyof paths, M extends HttpMethod> =
  Op<P, M> extends { parameters: { path: infer PP } } ? PP :
  Op<P, M> extends { parameters?: { path?: infer PP } } ? PP | undefined :
  undefined;

type SuccessResponseJson<P extends keyof paths, M extends HttpMethod> =
  Op<P, M> extends {
    responses: {
      200: { content: { 'application/json': infer R } };
    };
  }
    ? R
    : Op<P, M> extends {
          responses: {
            201: { content: { 'application/json': infer R } };
          };
        }
      ? R
      : Op<P, M> extends {
            responses: {
              204: unknown;
            };
          }
        ? void
        : unknown;

// --------------------------------------------------------------------------
// Auth + storage shims (mirror api.js conventions)
// --------------------------------------------------------------------------
const TOKEN_KEY = 'ds_access_token';

function readToken(): string | null {
  try {
    return globalThis.localStorage?.getItem?.(TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------
// ApiError
// --------------------------------------------------------------------------
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

// --------------------------------------------------------------------------
// Client factory
// --------------------------------------------------------------------------
export interface ApiClientOptions {
  /** Base URL for the API. Defaults to VITE_API_BASE_URL or http://127.0.0.1:8000. */
  baseUrl?: string;
  /** Override token getter. Defaults to localStorage 'ds_access_token'. */
  getToken?: () => string | null | undefined;
  /** Optional fetch implementation (for tests or SSR). */
  fetch?: typeof fetch;
  /** Called on 401 responses. Lets callers wire session-expired handlers. */
  on401?: () => void;
}

export interface RequestOptions<
  P extends keyof paths,
  M extends HttpMethod,
> {
  path?: PathParams<P, M>;
  query?: QueryParams<P, M>;
  body?: RequestBodyJson<P, M>;
  signal?: AbortSignal;
  /** Extra headers, merged on top of defaults. */
  headers?: Record<string, string>;
}

function defaultBaseUrl(): string {
  // Vite injects import.meta.env at build time. Fall back to localhost.
  // We can't statically reference import.meta.env here without leaking
  // Vite-specific types, so read it dynamically.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (import.meta as any)?.env;
  return env?.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
}

function interpolatePath(template: string, params: Record<string, unknown> | undefined): string {
  if (!params) return template;
  return template.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const v = params[key];
    if (v === undefined || v === null) {
      throw new Error(`Missing path parameter '${key}' for ${template}`);
    }
    return encodeURIComponent(String(v));
  });
}

function buildQuery(query: Record<string, unknown> | undefined): string {
  if (!query) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(item))}`);
      }
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

export interface ApiClient {
  baseUrl: string;
  request<P extends PathsWithMethod<M>, M extends HttpMethod>(
    method: M,
    path: P,
    opts?: RequestOptions<P, M>,
  ): Promise<SuccessResponseJson<P, M>>;
  get<P extends PathsWithMethod<'get'>>(path: P, opts?: RequestOptions<P, 'get'>): Promise<SuccessResponseJson<P, 'get'>>;
  post<P extends PathsWithMethod<'post'>>(path: P, opts?: RequestOptions<P, 'post'>): Promise<SuccessResponseJson<P, 'post'>>;
  put<P extends PathsWithMethod<'put'>>(path: P, opts?: RequestOptions<P, 'put'>): Promise<SuccessResponseJson<P, 'put'>>;
  patch<P extends PathsWithMethod<'patch'>>(path: P, opts?: RequestOptions<P, 'patch'>): Promise<SuccessResponseJson<P, 'patch'>>;
  delete<P extends PathsWithMethod<'delete'>>(path: P, opts?: RequestOptions<P, 'delete'>): Promise<SuccessResponseJson<P, 'delete'>>;
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = (options.baseUrl ?? defaultBaseUrl()).replace(/\/$/, '');
  const getToken = options.getToken ?? readToken;
  const f = options.fetch ?? fetch;

  async function request<P extends PathsWithMethod<M>, M extends HttpMethod>(
    method: M,
    path: P,
    opts: RequestOptions<P, M> = {} as RequestOptions<P, M>,
  ): Promise<SuccessResponseJson<P, M>> {
    const interpolated = interpolatePath(
      path as string,
      opts.path as Record<string, unknown> | undefined,
    );
    const url = `${baseUrl}${interpolated}${buildQuery(
      opts.query as Record<string, unknown> | undefined,
    )}`;

    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    const token = getToken();
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let body: BodyInit | undefined;
    if (opts.body !== undefined && method !== 'get') {
      headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
      body = JSON.stringify(opts.body);
    }

    const res = await f(url, {
      method: method.toUpperCase(),
      headers,
      body,
      signal: opts.signal,
    });

    if (res.status === 401) {
      options.on401?.();
    }

    if (res.status === 204) {
      return undefined as SuccessResponseJson<P, M>;
    }

    const ct = res.headers.get('content-type') ?? '';
    const isJson = ct.includes('application/json');
    const payload = isJson ? await res.json().catch(() => null) : await res.text();

    if (!res.ok) {
      const msg =
        (isJson && payload && typeof payload === 'object' && 'detail' in payload
          ? String((payload as { detail: unknown }).detail)
          : null) ?? `HTTP ${res.status} ${res.statusText}`;
      throw new ApiError(res.status, msg, payload);
    }

    return payload as SuccessResponseJson<P, M>;
  }

  return {
    baseUrl,
    request,
    get: (path, opts) => request('get', path, opts as never),
    post: (path, opts) => request('post', path, opts as never),
    put: (path, opts) => request('put', path, opts as never),
    patch: (path, opts) => request('patch', path, opts as never),
    delete: (path, opts) => request('delete', path, opts as never),
  };
}

// Default singleton — convenient for app code that doesn't need DI.
export const apiClient: ApiClient = createApiClient();
