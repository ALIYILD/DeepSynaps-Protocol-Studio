/**
 * useProtocolDetail — React hook for managing protocol detail navigation state.
 * Replaces window._protDetailId, window._protFromCondition, window._protOffLabelUseAcks
 * with component-local state.
 */
import { useState, useCallback } from 'react';

export function useProtocolDetail() {
  const [protDetailId, setProtDetailId] = useState(null);
  const [protFromCondition, setProtFromCondition] = useState(null);
  const [offLabelUseAcks, setOffLabelUseAcks] = useState({});

  // Mark a protocol as off-label acknowledged
  const acknowledgeOffLabel = useCallback((protoId) => {
    setOffLabelUseAcks(prev => ({
      ...prev,
      [protoId]: true,
    }));
  }, []);

  // Check if a protocol has been off-label acknowledged in this session
  const isOffLabelAcknowledged = useCallback((protoId) => {
    return offLabelUseAcks[protoId] === true;
  }, [offLabelUseAcks]);

  // Clear off-label acknowledgments (useful on logout or session reset)
  const clearOffLabelAcks = useCallback(() => {
    setOffLabelUseAcks({});
  }, []);

  return {
    protDetailId,
    setProtDetailId,
    protFromCondition,
    setProtFromCondition,
    offLabelUseAcks,
    acknowledgeOffLabel,
    isOffLabelAcknowledged,
    clearOffLabelAcks,
  };
}
