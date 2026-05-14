import React from 'react';
import { Sidebar } from '../components/Sidebar/index.js';
import { useSidebarNavigation, useSidebarState } from '../hooks/useSidebar.js';

/**
 * SidebarWrapper - Integrates sidebar into app with state management
 * 
 * Props:
 *   currentRouteId: The current active route ID
 *   onNavigate: Callback function when a route is clicked (receives routeId)
 *   userRole: User role for role-based visibility (default: 'clinician')
 */
const SidebarWrapper = ({
  currentRouteId,
  onNavigate,
  userRole = 'clinician'
}) => {
  const { groups, badges, onNavigate: handleNavigate } = useSidebarNavigation(
    currentRouteId,
    onNavigate
  );
  const { collapsed, mounted, toggleGroup } = useSidebarState();

  if (!mounted) {
    return <div className="sidebar sidebar-loading" />;
  }

  return (
    <Sidebar
      groups={groups}
      activeRoute={currentRouteId}
      onNavigate={handleNavigate}
      role={userRole}
      badges={badges}
    />
  );
};

export default SidebarWrapper;
