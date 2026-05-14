import React from 'react';
import './sidebar.css';

/**
 * SidebarItem - Individual route link in sidebar
 * Handles active highlighting, badges, click navigation
 */
const SidebarItem = ({
  id,
  label,
  icon,
  isActive,
  badge,
  depth = 0,
  onClick,
  ariaLabel
}) => {
  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onClick) {
      onClick(id);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(e);
    }
  };

  const paddingLeft = `${12 + depth * 16}px`;

  return (
    <div
      className={`sidebar-item ${isActive ? 'active' : ''} depth-${depth}`}
      style={{ paddingLeft }}
      role="menuitem"
      tabIndex={isActive ? 0 : -1}
      onKeyDown={handleKeyDown}
      aria-label={ariaLabel || label}
      aria-current={isActive ? 'page' : undefined}
    >
      <button
        className="sidebar-item-button"
        onClick={handleClick}
        aria-pressed={isActive}
        title={label}
      >
        {icon && (
          <span className="sidebar-item-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="sidebar-item-label">{label}</span>
        {badge && (
          <span
            className={`sidebar-item-badge badge-${badge.type || 'default'}`}
            aria-label={`${badge.count || '1'} ${badge.type || 'notification'}`}
          >
            {badge.count || '•'}
          </span>
        )}
      </button>
    </div>
  );
};

export default SidebarItem;
