import React, { useState, useEffect } from 'react';
import SidebarGroup from './SidebarGroup';
import './sidebar.css';

/**
 * Sidebar - Main sidebar component
 * Manages collapse state, active route highlighting, keyboard navigation
 * 
 * Props:
 *   groups: Array of sidebar groups (from SIDEBAR_GROUPS constant)
 *   activeRoute: Current route ID
 *   onNavigate: Callback when route is clicked (route ID)
 *   role: User role (clinician, admin, supervisor, patient)
 *   badges: Object mapping route IDs to badge data
 */
const Sidebar = ({
  groups,
  activeRoute,
  onNavigate,
  role = 'clinician',
  badges = {},
  storageKey = 'deepsync-sidebar-collapse-state'
}) => {
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [mounted, setMounted] = useState(false);

  // Load collapse state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        setCollapsedGroups(JSON.parse(saved));
      } catch (e) {
        console.warn('Failed to load sidebar state:', e);
      }
    }
    setMounted(true);
  }, [storageKey]);

  // Save collapse state to localStorage
  useEffect(() => {
    if (mounted) {
      localStorage.setItem(storageKey, JSON.stringify(collapsedGroups));
    }
  }, [collapsedGroups, storageKey, mounted]);

  // Expand group if new active route is in a collapsed group
  useEffect(() => {
    if (!mounted) return;

    const findGroupContainingRoute = (groupsArray, routeId, groupPath = []) => {
      for (const group of groupsArray) {
        const newPath = [...groupPath, group.id];

        // Check direct routes
        if (group.routes?.some(r => r.id === routeId)) {
          return newPath;
        }

        // Check nested routes
        if (group.nested) {
          const found = findGroupContainingRoute(group.nested, routeId, newPath);
          if (found) return found;
        }
      }
      return null;
    };

    const pathToRoute = findGroupContainingRoute(groups, activeRoute);
    if (pathToRoute) {
      // Expand all groups in path
      setCollapsedGroups(prev => {
        const updated = { ...prev };
        pathToRoute.forEach(groupId => {
          updated[groupId] = false; // uncollapsed
        });
        return updated;
      });
    }
  }, [activeRoute, groups, mounted]);

  const handleGroupToggle = (groupId) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  const handleRouteClick = (routeId) => {
    if (onNavigate) {
      onNavigate(routeId);
    }
  };

  // Filter groups based on role (future enhancement)
  const visibleGroups = groups.filter(group => {
    if (!group.roles) return true; // Show by default
    return group.roles.includes(role);
  });

  if (!mounted) {
    return <div className="sidebar sidebar-loading" />;
  }

  return (
    <nav
      className={`sidebar sidebar-${role}`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="sidebar-content" role="menubar">
        {visibleGroups.map(group => (
          <SidebarGroup
            key={group.id}
            id={group.id}
            label={group.label}
            icon={group.icon}
            routes={group.routes}
            nested={group.nested}
            activeRoute={activeRoute}
            collapsedGroups={collapsedGroups}
            onGroupToggle={handleGroupToggle}
            onRouteClick={handleRouteClick}
            depth={0}
            badges={badges}
          />
        ))}
      </div>
    </nav>
  );
};

export default Sidebar;
