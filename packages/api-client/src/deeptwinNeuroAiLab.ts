/**
 * Typed helpers for DeepTwin NeuroAI Lab research preview routes.
 *
 * Prefer these over string-literal paths when migrating off legacy api.js.
 */
import { apiClient } from './client';
import type { components } from './openapi-types';

export type NeuroAiStatusResponse = components['schemas']['NeuroAiStatusResponse'];
export type TimelinePreviewRequest = components['schemas']['TimelinePreviewRequest'];
export type TimelinePreviewResponse = components['schemas']['TimelinePreviewResponse'];
export type FeaturesPreviewRequest = components['schemas']['FeaturesPreviewRequest'];
export type FeaturesPreviewResponse = components['schemas']['FeaturesPreviewResponse'];
export type SimulationPreviewRequest = components['schemas']['SimulationPreviewRequest'];
export type SimulationPreviewResponse = components['schemas']['SimulationPreviewResponse'];

export function deeptwinNeuroAiLabStatus(): Promise<NeuroAiStatusResponse> {
  return apiClient.get('/api/v1/deeptwin/neuroai/status');
}

export function deeptwinNeuroAiLabTimelinePreview(
  body: TimelinePreviewRequest,
): Promise<TimelinePreviewResponse> {
  return apiClient.post('/api/v1/deeptwin/neuroai/timeline/preview', { body });
}

export function deeptwinNeuroAiLabFeaturesPreview(
  body: FeaturesPreviewRequest,
): Promise<FeaturesPreviewResponse> {
  return apiClient.post('/api/v1/deeptwin/neuroai/features/preview', { body });
}

export function deeptwinNeuroAiLabSimulationPreview(
  body: SimulationPreviewRequest,
): Promise<SimulationPreviewResponse> {
  return apiClient.post('/api/v1/deeptwin/neuroai/simulation/preview', { body });
}
