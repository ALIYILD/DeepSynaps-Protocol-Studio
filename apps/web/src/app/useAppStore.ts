import { useContext } from "react";

import { Feature, hasFeature } from "../lib/packages";
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

/** Convenience hook for package-level entitlement checks. */
export function usePackage() {
  const { packageId } = useAppState();
  return {
    packageId,
    hasFeature: (feature: Feature) => hasFeature(packageId, feature),
  };
}
