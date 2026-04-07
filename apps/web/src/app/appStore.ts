import { createContext, Dispatch } from "react";

import { ThemeMode, UserRole } from "../types/domain";

export type AppState = {
  role: UserRole;
  theme: ThemeMode;
  searchQuery: string;
  notificationsOpen: boolean;
  profileMenuOpen: boolean;
  unreadNotifications: string[];
};

export type AppAction =
  | { type: "set_role"; role: UserRole }
  | { type: "toggle_theme" }
  | { type: "set_search"; value: string }
  | { type: "toggle_notifications" }
  | { type: "toggle_profile_menu" }
  | { type: "dismiss_notification"; id: string };

export const AppStateContext = createContext<AppState | null>(null);
export const AppDispatchContext = createContext<Dispatch<AppAction> | null>(null);
