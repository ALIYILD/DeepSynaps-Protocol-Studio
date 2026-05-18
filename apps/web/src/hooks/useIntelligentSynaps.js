import { useState, useCallback } from 'react';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

/**
 * Custom hook for Intelligent Synaps v4 API communication.
 * Provides methods for querying, searching, protocol generation,
 * safety checks, cross-referencing, and health monitoring.
 */
export function useIntelligentSynaps() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [health, setHealth] = useState(null);
    const [recentQueries, setRecentQueries] = useState([]);

    /**
     * Send a natural language query to Intelligent Synaps.
     * @param {string} queryText - The natural language query.
     * @param {object} context - Additional context (e.g. { top_n: 10 }).
     * @param {number} minConfidence - Minimum confidence threshold.
     */
    const query = useCallback(async (queryText, context = {}, minConfidence = 0.6) => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.post(`${API_BASE}/intelligent-synaps/query`, {
                query: queryText,
                context,
                min_confidence: minConfidence,
            });
            const data = res.data;
            // Update recent queries
            setRecentQueries(prev => [
                { query: queryText, ...data, timestamp: new Date().toISOString() },
                ...prev.slice(0, 19), // keep last 20
            ]);
            return data;
        } catch (err) {
            const msg = err.response?.data?.detail || err.message;
            setError(msg);
            throw new Error(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Full-text search with optional filters.
     * @param {string} queryText - Search text.
     * @param {object} filters - Filters (e.g. { modalities, indications }).
     */
    const search = useCallback(async (queryText, filters = {}) => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.post(`${API_BASE}/intelligent-synaps/search`, {
                query: queryText,
                filters,
            });
            return res.data;
        } catch (err) {
            const msg = err.response?.data?.detail || err.message;
            setError(msg);
            throw new Error(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Generate an individualized neuromodulation protocol.
     * @param {object} patientData - Patient information.
     * @param {string} target - Target indication.
     * @param {string[]} modalities - Selected modalities.
     */
    const generateProtocol = useCallback(async (
        patientData,
        target,
        modalities = ["tDCS", "TMS", "PBM", "Neurofeedback"]
    ) => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.post(`${API_BASE}/intelligent-synaps/protocol/generate`, {
                patient_data: patientData,
                target_indication: target,
                modalities,
            });
            return res.data;
        } catch (err) {
            const msg = err.response?.data?.detail || err.message;
            setError(msg);
            throw new Error(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Perform a safety check for a protocol.
     * @param {object} protocol - Protocol to check.
     */
    const safetyCheck = useCallback(async (protocol) => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.post(`${API_BASE}/intelligent-synaps/safety-check`, {
                protocol,
            });
            return res.data;
        } catch (err) {
            const msg = err.response?.data?.detail || err.message;
            setError(msg);
            throw new Error(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Cross-reference protocols with literature evidence.
     * @param {string} protocolId - Protocol ID.
     */
    const crossReference = useCallback(async (protocolId) => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.post(`${API_BASE}/intelligent-synaps/cross-reference`, {
                protocol_id: protocolId,
            });
            return res.data;
        } catch (err) {
            const msg = err.response?.data?.detail || err.message;
            setError(msg);
            throw new Error(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Fetch detailed health status of all adapters.
     */
    const getHealth = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.get(`${API_BASE}/health/detailed`);
            setHealth(res.data);
            return res.data;
        } catch (err) {
            const msg = err.response?.data?.detail || err.message;
            setError(msg);
            throw new Error(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    return {
        query,
        search,
        generateProtocol,
        safetyCheck,
        crossReference,
        getHealth,
        loading,
        error,
        health,
        recentQueries,
        clearError: () => setError(null),
    };
}
