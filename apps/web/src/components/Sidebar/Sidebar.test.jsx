import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sidebar from '../Sidebar';
import SidebarGroup from '../SidebarGroup';
import SidebarItem from '../SidebarItem';
import { SIDEBAR_GROUPS, ROUTE_TO_GROUP } from '../../sidebar-config';

describe('Sidebar Component Suite', () => {
  
  // ========== SIDEBAR ITEM TESTS ==========
  describe('SidebarItem', () => {
    it('renders route label and icon', () => {
      render(
        <SidebarItem
          id="test-route"
          label="Test Route"
          icon="🧪"
          isActive={false}
          onClick={() => {}}
        />
      );
      expect(screen.getByText('Test Route')).toBeInTheDocument();
      expect(screen.getByText('🧪')).toBeInTheDocument();
    });

    it('highlights active state', () => {
      const { container } = render(
        <SidebarItem
          id="test-route"
          label="Test Route"
          isActive={true}
          onClick={() => {}}
        />
      );
      const item = container.querySelector('.sidebar-item');
      expect(item).toHaveClass('active');
    });

    it('renders badge with count', () => {
      render(
        <SidebarItem
          id="test-route"
          label="Test Route"
          badge={{ type: 'alert', count: 5 }}
          onClick={() => {}}
        />
      );
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('handles click navigation', async () => {
      const onClick = vi.fn();
      render(
        <SidebarItem
          id="test-route"
          label="Test Route"
          onClick={onClick}
        />
      );
      const button = screen.getByRole('button');
      await userEvent.click(button);
      expect(onClick).toHaveBeenCalledWith('test-route');
    });

    it('handles Enter key navigation', async () => {
      const onClick = vi.fn();
      render(
        <SidebarItem
          id="test-route"
          label="Test Route"
          isActive={true}
          onClick={onClick}
        />
      );
      const button = screen.getByRole('button');
      fireEvent.keyDown(button, { key: 'Enter', code: 'Enter' });
      expect(onClick).toHaveBeenCalledWith('test-route');
    });

    it('handles Space key navigation', async () => {
      const onClick = vi.fn();
      render(
        <SidebarItem
          id="test-route"
          label="Test Route"
          isActive={true}
          onClick={onClick}
        />
      );
      const button = screen.getByRole('button');
      fireEvent.keyDown(button, { key: ' ', code: 'Space' });
      expect(onClick).toHaveBeenCalledWith('test-route');
    });

    it('respects depth padding', () => {
      const { container } = render(
        <SidebarItem
          id="test-route"
          label="Test Route"
          depth={2}
          onClick={() => {}}
        />
      );
      const item = container.querySelector('.sidebar-item');
      expect(item).toHaveStyle('paddingLeft: 44px'); // 12 + 2*16
    });
  });

  // ========== SIDEBAR GROUP TESTS ==========
  describe('SidebarGroup', () => {
    it('renders group header', () => {
      render(
        <SidebarGroup
          id="test-group"
          label="Test Group"
          icon="🧪"
          routes={[]}
          activeRoute=""
          collapsedGroups={{}}
          onGroupToggle={() => {}}
          onRouteClick={() => {}}
        />
      );
      expect(screen.getByText('Test Group')).toBeInTheDocument();
    });

    it('toggles collapse state', async () => {
      const onToggle = vi.fn();
      render(
        <SidebarGroup
          id="test-group"
          label="Test Group"
          icon="🧪"
          routes={[{ id: 'route1', label: 'Route 1' }]}
          activeRoute=""
          collapsedGroups={{}}
          onGroupToggle={onToggle}
          onRouteClick={() => {}}
        />
      );
      const header = screen.getByRole('button');
      await userEvent.click(header);
      expect(onToggle).toHaveBeenCalledWith('test-group');
    });

    it('renders routes when expanded', () => {
      render(
        <SidebarGroup
          id="test-group"
          label="Test Group"
          routes={[
            { id: 'route1', label: 'Route 1' },
            { id: 'route2', label: 'Route 2' }
          ]}
          activeRoute=""
          collapsedGroups={{ 'test-group': false }}
          onGroupToggle={() => {}}
          onRouteClick={() => {}}
        />
      );
      expect(screen.getByText('Route 1')).toBeInTheDocument();
      expect(screen.getByText('Route 2')).toBeInTheDocument();
    });

    it('hides routes when collapsed', () => {
      render(
        <SidebarGroup
          id="test-group"
          label="Test Group"
          routes={[{ id: 'route1', label: 'Route 1' }]}
          activeRoute=""
          collapsedGroups={{ 'test-group': true }}
          onGroupToggle={() => {}}
          onRouteClick={() => {}}
        />
      );
      expect(screen.queryByText('Route 1')).not.toBeInTheDocument();
    });

    it('highlights group when child is active', () => {
      const { container } = render(
        <SidebarGroup
          id="test-group"
          label="Test Group"
          routes={[{ id: 'route1', label: 'Route 1' }]}
          activeRoute="route1"
          collapsedGroups={{}}
          onGroupToggle={() => {}}
          onRouteClick={() => {}}
        />
      );
      const group = container.querySelector('.sidebar-group');
      expect(group).toHaveClass('has-active');
    });

    it('renders nested groups', () => {
      render(
        <SidebarGroup
          id="test-group"
          label="Test Group"
          nested={[
            {
              id: 'nested-group',
              label: 'Nested Group',
              routes: [{ id: 'route1', label: 'Route 1' }]
            }
          ]}
          activeRoute=""
          collapsedGroups={{}}
          onGroupToggle={() => {}}
          onRouteClick={() => {}}
        />
      );
      expect(screen.getByText('Nested Group')).toBeInTheDocument();
    });
  });

  // ========== SIDEBAR MAIN COMPONENT TESTS ==========
  describe('Sidebar', () => {
    const mockGroups = [
      {
        id: 'today',
        label: 'Today',
        icon: '🏠',
        routes: [
          { id: 'dashboard', label: 'Dashboard' },
          { id: 'inbox', label: 'Inbox' }
        ]
      },
      {
        id: 'patients',
        label: 'Patients',
        icon: '👥',
        routes: [
          { id: 'patients-hub', label: 'Patients Hub' }
        ]
      }
    ];

    it('renders all groups', () => {
      render(
        <Sidebar
          groups={mockGroups}
          activeRoute=""
          onNavigate={() => {}}
          role="clinician"
          badges={{}}
        />
      );
      expect(screen.getByText('Today')).toBeInTheDocument();
      expect(screen.getByText('Patients')).toBeInTheDocument();
    });

    it('passes active route to groups', () => {
      render(
        <Sidebar
          groups={mockGroups}
          activeRoute="dashboard"
          onNavigate={() => {}}
          role="clinician"
          badges={{}}
        />
      );
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    it('calls onNavigate when route is clicked', async () => {
      const onNavigate = vi.fn();
      render(
        <Sidebar
          groups={mockGroups}
          activeRoute=""
          onNavigate={onNavigate}
          role="clinician"
          badges={{}}
        />
      );
      const dashboardButton = screen.getByText('Dashboard').closest('button');
      await userEvent.click(dashboardButton);
      expect(onNavigate).toHaveBeenCalledWith('dashboard');
    });

    it('persists collapse state to localStorage', async () => {
      const { rerender } = render(
        <Sidebar
          groups={mockGroups}
          activeRoute=""
          onNavigate={() => {}}
          role="clinician"
          badges={{}}
        />
      );
      
      const todayHeader = screen.getByText('Today').closest('button');
      await userEvent.click(todayHeader);
      
      await waitFor(() => {
        const saved = localStorage.getItem('deepsync-sidebar-collapse-state');
        expect(saved).toContain('today');
      });
    });

    it('filters groups by role', () => {
      const groupsWithRoles = [
        {
          id: 'today',
          label: 'Today',
          routes: [],
          roles: ['clinician', 'admin']
        },
        {
          id: 'admin',
          label: 'Admin',
          routes: [],
          roles: ['admin']
        }
      ];

      const { rerender } = render(
        <Sidebar
          groups={groupsWithRoles}
          activeRoute=""
          onNavigate={() => {}}
          role="clinician"
          badges={{}}
        />
      );
      
      expect(screen.getByText('Today')).toBeInTheDocument();
      expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    });

    it('auto-expands group when active route changes', async () => {
      const { rerender } = render(
        <Sidebar
          groups={mockGroups}
          activeRoute=""
          onNavigate={() => {}}
          role="clinician"
          badges={{}}
          storageKey="test-sidebar-storage"
        />
      );

      // Initially expand today and then navigate
      rerender(
        <Sidebar
          groups={mockGroups}
          activeRoute="dashboard"
          onNavigate={() => {}}
          role="clinician"
          badges={{}}
          storageKey="test-sidebar-storage"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeVisible();
      });
    });
  });

  // ========== ROUTE MAPPING TESTS ==========
  describe('Route Configuration', () => {
    it('all routes are mapped in ROUTE_TO_GROUP', () => {
      const allRoutes = new Set();
      
      SIDEBAR_GROUPS.forEach(group => {
        if (group.routes) {
          group.routes.forEach(route => {
            allRoutes.add(route.id);
          });
        }
        if (group.nested) {
          group.nested.forEach(nestedGroup => {
            if (nestedGroup.routes) {
              nestedGroup.routes.forEach(route => {
                allRoutes.add(route.id);
              });
            }
          });
        }
      });

      allRoutes.forEach(routeId => {
        expect(ROUTE_TO_GROUP).toHaveProperty(routeId);
      });
    });

    it('SIDEBAR_GROUPS has required structure', () => {
      expect(SIDEBAR_GROUPS).toBeInstanceOf(Array);
      expect(SIDEBAR_GROUPS.length).toBeGreaterThan(0);

      SIDEBAR_GROUPS.forEach(group => {
        expect(group).toHaveProperty('id');
        expect(group).toHaveProperty('label');
        expect(group).toHaveProperty('icon');
        expect(group.routes || group.nested).toBeDefined();
      });
    });
  });

  // ========== ACCESSIBILITY TESTS ==========
  describe('Accessibility', () => {
    it('has proper ARIA labels', () => {
      render(
        <Sidebar
          groups={[
            {
              id: 'today',
              label: 'Today',
              routes: [{ id: 'dashboard', label: 'Dashboard' }]
            }
          ]}
          activeRoute=""
          onNavigate={() => {}}
          role="clinician"
          badges={{}}
        />
      );
      
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });

    it('supports keyboard navigation', async () => {
      const onNavigate = vi.fn();
      render(
        <Sidebar
          groups={[
            {
              id: 'today',
              label: 'Today',
              routes: [{ id: 'dashboard', label: 'Dashboard' }]
            }
          ]}
          activeRoute="dashboard"
          onNavigate={onNavigate}
          role="clinician"
          badges={{}}
        />
      );
      
      const dashboardButton = screen.getByText('Dashboard').closest('button');
      dashboardButton?.focus();
      expect(document.activeElement).toBe(dashboardButton);
    });

    it('announces active route state', () => {
      const { container } = render(
        <Sidebar
          groups={[
            {
              id: 'today',
              label: 'Today',
              routes: [{ id: 'dashboard', label: 'Dashboard' }]
            }
          ]}
          activeRoute="dashboard"
          onNavigate={() => {}}
          role="clinician"
          badges={{}}
        />
      );
      
      const activeItem = container.querySelector('[aria-current="page"]');
      expect(activeItem).toBeInTheDocument();
    });
  });

  // ========== PERFORMANCE TESTS ==========
  describe('Performance', () => {
    it('renders large route list efficiently', () => {
      const largeGroup = {
        id: 'large',
        label: 'Large Group',
        routes: Array.from({ length: 100 }, (_, i) => ({
          id: `route-${i}`,
          label: `Route ${i}`
        }))
      };

      const start = performance.now();
      render(
        <Sidebar
          groups={[largeGroup]}
          activeRoute="route-0"
          onNavigate={() => {}}
          role="clinician"
          badges={{}}
        />
      );
      const duration = performance.now() - start;

      // Should render in less than 500ms
      expect(duration).toBeLessThan(500);
    });
  });
});
