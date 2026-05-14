import React, { useState, useEffect } from 'react';
import SidebarItem from './SidebarItem';
import './sidebar.css';

/**
 * SidebarGroup - Collapsible group of routes
 * Handles expand/collapse state, localStorage persistence, active highlighting
 */
const SidebarGroup = ({
  id,
  label,
  icon,
  routes,
  nested,
  activeRoute,
  collapsedGroups,
  onGroupToggle,
  onRouteClick,
  depth = 0,
  badges = {}
}) => {
  const isCollapsed = collapsedGroups?.[id] ?? false;

  const handleToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onGroupToggle) {
      onGroupToggle(id);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle(e);
    }
  };

  // Check if any child is active
  const hasActiveChild = () => {
    if (routes) {
      return routes.some(route => route.id === activeRoute);
    }
    if (nested) {
      return nested.some(group =>
        group.routes && group.routes.some(route => route.id === activeRoute)
      );
    }
    return false;
  };

  const paddingLeft = `${12 + depth * 16}px`;
  const showAsExpandable = nested || routes;

  return (
    <div
      className={`sidebar-group ${depth > 0 ? 'nested' : 'top-level'} ${
        hasActiveChild() ? 'has-active' : ''
      }`}
      role="menuitemradio"
      aria-expanded={!isCollapsed}
    >
      {/* Group Header */}
      {showAsExpandable && (
        <button
          className={`sidebar-group-header ${isCollapsed ? 'collapsed' : 'expanded'}`}
          onClick={handleToggle}
          onKeyDown={handleKeyDown}
          style={{ paddingLeft }}
          aria-label={`${label} ${isCollapsed ? 'expand' : 'collapse'}`}
          title={label}
        >
          {icon && (
            <span className="sidebar-group-icon" aria-hidden="true">
              {icon}
            </span>
          )}
          <span className="sidebar-group-label">{label}</span>
          {(nested || routes) && (
            <span
              className={`sidebar-group-chevron ${isCollapsed ? 'collapsed' : ''}`}
              aria-hidden="true"
            >
              ▼
            </span>
          )}
        </button>
      )}

      {/* Routes (collapsed state) */}
      {!isCollapsed && routes && (
        <div className="sidebar-items-list" role="menu">
          {routes.map(route => (
            <SidebarItem
              key={route.id}
              id={route.id}
              label={route.label}
              icon={route.icon}
              isActive={route.id === activeRoute}
              badge={badges[route.id]}
              depth={depth + 1}
              onClick={onRouteClick}
              ariaLabel={`${label} - ${route.label}`}
            />
          ))}
        </div>
      )}

      {/* Nested Groups (collapsed state) */}
      {!isCollapsed && nested && (
        <div className="sidebar-nested-groups" role="menu">
          {nested.map(nestedGroup => (
            <SidebarGroup
              key={nestedGroup.id}
              id={nestedGroup.id}
              label={nestedGroup.label}
              icon={nestedGroup.icon}
              routes={nestedGroup.routes}
              nested={nestedGroup.nested}
              activeRoute={activeRoute}
              collapsedGroups={collapsedGroups}
              onGroupToggle={onGroupToggle}
              onRouteClick={onRouteClick}
              depth={depth + 1}
              badges={badges}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default SidebarGroup;
