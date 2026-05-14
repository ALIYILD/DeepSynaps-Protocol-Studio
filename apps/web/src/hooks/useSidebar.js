import { useState, useCallback, useEffect } from 'react';
import { SIDEBAR_GROUPS, ROUTE_TO_GROUP, getCurrentBadges } from '../sidebar-config.js';

/**
 * useSidebarNavigation Hook
 * Manages sidebar state, route navigation, and badge updates
 */
export function useSidebarNavigation(currentRouteId, onNavigate) {
  const [badges, setBadges] = useState(getCurrentBadges());

  // Update badges periodically or on demand
  const updateBadges = useCallback(() => {
    setBadges(getCurrentBadges());
  }, []);

  // Handle route navigation from sidebar
  const handleRouteClick = useCallback((routeId) => {
    if (onNavigate) {
      onNavigate(routeId);
    }
  }, [onNavigate]);

  // Poll for badge updates every 30 seconds
  useEffect(() => {
    const interval = setInterval(updateBadges, 30000);
    return () => clearInterval(interval);
  }, [updateBadges]);

  return {
    groups: SIDEBAR_GROUPS,
    activeRoute: currentRouteId,
    badges,
    onNavigate: handleRouteClick,
    updateBadges,
  };
}

/**
 * useSidebarState Hook
 * Manages sidebar collapse state persistence
 */
export function useSidebarState(storageKey = 'deepsync-sidebar-collapse-state') {
  const [collapsed, setCollapsed] = useState({});
  const [mounted, setMounted] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        setCollapsed(JSON.parse(saved));
      } catch (e) {
        console.warn('Failed to load sidebar state:', e);
      }
    }
    setMounted(true);
  }, [storageKey]);

  // Save to localStorage on change
  useEffect(() => {
    if (mounted) {
      localStorage.setItem(storageKey, JSON.stringify(collapsed));
    }
  }, [collapsed, storageKey, mounted]);

  const toggleGroup = useCallback((groupId) => {
    setCollapsed(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  }, []);

  return {
    collapsed,
    mounted,
    toggleGroup,
  };
}
