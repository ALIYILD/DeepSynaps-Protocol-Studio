/**
 * useBiomarkerCache — React hook for managing biomarker session and cache state.
 * Replaces window.biomarkerSession and window.neuroMarkerCache with component-local state.
 */
import { useState, useCallback } from 'react';

export function useBiomarkerCache() {
  const [biomarkerSession, setBiomarkerSession] = useState(null);
  const [neuroMarkerCache, setNeuroMarkerCache] = useState({});
  const [biomarkerLoading, setBiomarkerLoading] = useState(false);
  const [biomarkerError, setBiomarkerError] = useState(null);

  // Initialize or update biomarker session
  const initSession = useCallback((sessionData) => {
    setBiomarkerSession(sessionData);
    setBiomarkerError(null);
  }, []);

  // Update a specific biomarker in the cache
  const updateBiomarker = useCallback((key, value) => {
    setNeuroMarkerCache(prev => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  // Batch update multiple biomarkers
  const updateBiomarkers = useCallback((updates) => {
    setNeuroMarkerCache(prev => ({
      ...prev,
      ...updates,
    }));
  }, []);

  // Get a specific biomarker from cache
  const getBiomarker = useCallback((key) => {
    return neuroMarkerCache[key];
  }, [neuroMarkerCache]);

  // Clear cache and session
  const clearCache = useCallback(() => {
    setBiomarkerSession(null);
    setNeuroMarkerCache({});
    setBiomarkerError(null);
  }, []);

  // Set loading state
  const setLoading = useCallback((loading) => {
    setBiomarkerLoading(loading);
  }, []);

  // Set error state
  const setError = useCallback((error) => {
    setBiomarkerError(error);
  }, []);

  return {
    biomarkerSession,
    initSession,
    neuroMarkerCache,
    updateBiomarker,
    updateBiomarkers,
    getBiomarker,
    clearCache,
    biomarkerLoading,
    setLoading,
    biomarkerError,
    setError,
  };
}
