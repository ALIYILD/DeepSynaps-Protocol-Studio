import { ReactNode, useMemo, useReducer } from "react";

import { roleProfiles, workspaceAlerts } from "../data/mockData";
import { AppAction, AppDispatchContext, AppState, AppStateContext } from "./appStore";

export const defaultAppState: AppState = {
  role: "clinician",
  packageId: "clinician_pro",
  theme: "dark",
  searchQuery: "",
  notificationsOpen: false,
  profileMenuOpen: false,
  unreadNotifications: workspaceAlerts.map((alert) => alert.id),
};

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "set_role":
      return { ...state, role: action.role };
    case "set_package":
      return { ...state, packageId: action.packageId };
    case "toggle_theme":
      return { ...state, theme: state.theme === "dark" ? "light" : "dark" };
    case "set_search":
      return { ...state, searchQuery: action.value };
    case "toggle_notifications":
      return { ...state, notificationsOpen: !state.notificationsOpen, profileMenuOpen: false };
    case "toggle_profile_menu":
      return { ...state, profileMenuOpen: !state.profileMenuOpen, notificationsOpen: false };
    case "dismiss_notification":
      return {
        ...state,
        unreadNotifications: state.unreadNotifications.filter((id) => id !== action.id),
      };
    default:
      return state;
  }
}

export function AppProvider({
  children,
  initialState,
}: {
  children: ReactNode;
  initialState?: Partial<AppState>;
}) {
  const [state, dispatch] = useReducer(reducer, {
    ...defaultAppState,
    ...initialState,
  });
  const roleMeta = useMemo(
    () => roleProfiles.find((profile) => profile.role === state.role) ?? roleProfiles[0],
    [state.role],
  );

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        <div data-theme={state.theme}>
          <div className="min-h-screen text-[var(--text)]">{children}</div>
          <div className="hidden" aria-hidden="true">
            {roleMeta.label}
          </div>
        </div>
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}
