// Public surface for @deepsynaps/api-client.
//
// Intended use during migration:
//
//   import { apiClient, ApiError } from '@deepsynaps/api-client';
//   import type { Schemas } from '@deepsynaps/api-client';
//
//   const out = await apiClient.get('/health');           //   → typed
//   const me  = await apiClient.get('/api/v1/auth/me');   //   → typed
//
// The legacy `apps/web/src/api.js` remains the source of truth until each
// page is migrated. See README.md.

export {
  apiClient,
  createApiClient,
  ApiError,
  type ApiClient,
  type ApiClientOptions,
  type RequestOptions,
  type PathsWithMethod,
  type Paths,
  type Schemas,
} from './client';

export type { paths, components, operations } from './openapi-types';
