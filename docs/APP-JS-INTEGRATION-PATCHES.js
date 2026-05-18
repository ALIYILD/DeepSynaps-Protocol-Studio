/**
 * SIDEBAR INTEGRATION PATCHES FOR APP.JS
 * 
 * This file defines the patches needed to integrate the sidebar component
 * into the main app.js file. Apply these changes in order.
 */

// ============================================
// PATCH 1: Add imports at top of app.js
// ============================================
// ADD AFTER: existing React imports

import { Sidebar } from './components/Sidebar/index.js';
import { SIDEBAR_GROUPS, ROUTE_TO_GROUP, getCurrentBadges } from './sidebar-config.js';
import { useSidebarNavigation, useSidebarState } from './hooks/useSidebar.js';

// ============================================
// PATCH 2: Add state management hook
// ============================================
// ADD in the main App component (after other hooks)

// Sidebar state management
const [currentRouteId, setCurrentRouteId] = useState(null);
const [userRole, setUserRole] = useState('clinician'); // clinician, admin, supervisor, patient
const [badges, setBadges] = useState(getCurrentBadges());

// Extract current route from URL on mount/change
useEffect(() => {
  const extractRouteFromURL = () => {
    // Get route from window.location.pathname or hash
    const path = window.location.pathname || window.location.hash;
    const routeId = path.split('/').pop()?.split('?')[0] || 'dashboard';
    setCurrentRouteId(routeId);
  };

  extractRouteFromURL();
  window.addEventListener('hashchange', extractRouteFromURL);
  window.addEventListener('popstate', extractRouteFromURL);

  return () => {
    window.removeEventListener('hashchange', extractRouteFromURL);
    window.removeEventListener('popstate', extractRouteFromURL);
  };
}, []);

// Poll for badge updates every 30 seconds
useEffect(() => {
  const interval = setInterval(() => {
    setBadges(getCurrentBadges());
  }, 30000);
  return () => clearInterval(interval);
}, []);

// ============================================
// PATCH 3: Add navigation handler
// ============================================
// ADD in the main App component

const handleSidebarNavigation = useCallback((routeId) => {
  // Update current route
  setCurrentRouteId(routeId);

  // Use existing app navigation (adjust based on your router)
  if (window._nav) {
    // If using legacy navigation
    window._nav(routeId);
  } else if (window.history && window.history.pushState) {
    // If using browser history API
    const newPath = `/app/${routeId}`;
    window.history.pushState({ routeId }, '', newPath);
    // Trigger route change detection
    window.dispatchEvent(new PopStateEvent('popstate', { state: { routeId } }));
  }
}, []);

// ============================================
// PATCH 4: Get user role (from API or context)
// ============================================
// ADD in the main App component

useEffect(() => {
  // Fetch or get user role from auth context/API
  const fetchUserRole = async () => {
    try {
      // Replace with actual API call
      // const response = await fetch('/api/user/profile');
      // const userData = await response.json();
      // setUserRole(userData.role);
      
      // For now, read from localStorage or default
      const savedRole = localStorage.getItem('userRole') || 'clinician';
      setUserRole(savedRole);
    } catch (e) {
      console.warn('Failed to fetch user role:', e);
      setUserRole('clinician');
    }
  };

  fetchUserRole();
}, []);

// ============================================
// PATCH 5: Render sidebar in main layout
// ============================================
// REPLACE the existing sidebar HTML in app.js render output

return (
  <>
    {/* Other app components... */}

    {/* SIDEBAR COMPONENT */}
    <Sidebar
      groups={SIDEBAR_GROUPS}
      activeRoute={currentRouteId}
      onNavigate={handleSidebarNavigation}
      role={userRole}
      badges={badges}
    />

    {/* Rest of app layout... */}
  </>
);

// ============================================
// PATCH 6: Add route validation service
// ============================================
// CREATE: services/route-validator.js

export function validateRoute(routeId) {
  // Search in ROUTE_TO_GROUP for valid route
  if (!routeId || typeof routeId !== 'string') return null;
  
  const groupId = ROUTE_TO_GROUP[routeId];
  if (!groupId) {
    console.warn(`Route not found: ${routeId}`);
    return null;
  }

  // Find the route in SIDEBAR_GROUPS
  for (const group of SIDEBAR_GROUPS) {
    if (group.routes) {
      const route = group.routes.find(r => r.id === routeId);
      if (route) return { groupId, route };
    }

    if (group.nested) {
      for (const nested of group.nested) {
        if (nested.routes) {
          const route = nested.routes.find(r => r.id === routeId);
          if (route) return { groupId, route, nested: true };
        }
      }
    }
  }

  return null;
}

// ============================================
// PATCH 7: Add deep linking support
// ============================================
// ADD in main app initialization

// Handle direct navigation via URL (deep linking)
window.navigateToRoute = function(routeId) {
  const validation = validateRoute(routeId);
  if (validation) {
    handleSidebarNavigation(routeId);
  } else {
    console.error(`Invalid route: ${routeId}`);
    handleSidebarNavigation('dashboard'); // Fallback
  }
};

// Example deep link: /app/patient-detail?id=123
// Automatically extract route from URL on mount
window.addEventListener('load', () => {
  const routeFromURL = new URLSearchParams(window.location.search).get('route');
  if (routeFromURL) {
    window.navigateToRoute(routeFromURL);
  }
});

// ============================================
// PATCH 8: Add mobile sidebar toggle
// ============================================
// ADD for mobile bottom nav

const handleMobileSidebarToggle = useCallback(() => {
  // Toggle sidebar visibility on mobile
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.toggle('mobile-open');
  }
}, []);

// Render mobile toggle button (add to mobile header)
<button
  className="mobile-sidebar-toggle"
  onClick={handleMobileSidebarToggle}
  aria-label="Toggle sidebar"
>
  ☰
</button>

// ============================================
// PATCH 9: CSS for mobile sidebar integration
// ============================================
// ADD to main styles.css

/* Mobile sidebar integration */
@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 1000;
  }

  main, #app-content, [role="main"] {
    padding-bottom: 60px;
  }

  .mobile-sidebar-toggle {
    display: block;
  }
}

@media (min-width: 769px) {
  .mobile-sidebar-toggle {
    display: none;
  }
}

// ============================================
// PATCH 10: Add sidebar error boundary
// ============================================
// CREATE: components/SidebarErrorBoundary.jsx

import React from 'react';

export class SidebarErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Sidebar error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="sidebar-error">
          <p>Sidebar temporarily unavailable</p>
          <button onClick={() => window.location.reload()}>
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// USE: Wrap Sidebar component
<SidebarErrorBoundary>
  <Sidebar {...props} />
</SidebarErrorBoundary>

