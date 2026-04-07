import { useContext } from "react";

import { AppDispatchContext, AppStateContext } from "./appStore";

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used inside AppProvider");
  }
  return context;
}

export function useAppDispatch() {
  const context = useContext(AppDispatchContext);
  if (!context) {
    throw new Error("useAppDispatch must be used inside AppProvider");
  }
  return context;
}
