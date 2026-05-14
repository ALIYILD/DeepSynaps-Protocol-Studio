/**
 * SIDEBAR INTEGRATION FOR APP.JS
 * 
 * Add this import at the top of app.js (after other imports):
 * import { Sidebar } from './components/Sidebar/index.js';
 * import { SIDEBAR_GROUPS } from './sidebar-config.js';
 * 
 * Add this function to handle sidebar navigation:
 */

// Called when sidebar route is clicked
export function handleSidebarNavigation(routeId) {
  if (window._nav) {
    window._nav(routeId);
  }
}

// Initialize sidebar component
export function initializeSidebar(currentRouteId, userRole = 'clinician') {
  const sidebarContainer = document.getElementById('sidebar-react-root');
  
  if (!sidebarContainer) {
    console.warn('Sidebar container not found');
    return;
  }

  // Import React and Sidebar on demand
  const React = window.React;
  if (!React) {
    console.warn('React not available');
    return;
  }

  const { Sidebar } = window.DeepSynapsComponents || {};
  if (!Sidebar) {
    console.warn('Sidebar component not available');
    return;
  }

  const { SIDEBAR_GROUPS } = window.DeepSynapsConfig || {};
  if (!SIDEBAR_GROUPS) {
    console.warn('Sidebar config not available');
    return;
  }

  try {
    const root = ReactDOM.createRoot(sidebarContainer);
    root.render(
      React.createElement(Sidebar, {
        groups: SIDEBAR_GROUPS,
        activeRoute: currentRouteId,
        onNavigate: handleSidebarNavigation,
        role: userRole,
        badges: {}
      })
    );
  } catch (e) {
    console.error('Failed to render sidebar:', e);
  }
}

// Update active route in sidebar
export function updateSidebarActiveRoute(routeId) {
  const sidebarContainer = document.getElementById('sidebar-react-root');
  if (sidebarContainer) {
    // Trigger re-render by calling initializeSidebar again
    const userRole = document.body.getAttribute('data-user-role') || 'clinician';
    initializeSidebar(routeId, userRole);
  }
}
