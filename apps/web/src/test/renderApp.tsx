import { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { AppProvider, defaultAppState } from "../app/AppContext";
import { AppRoutes } from "../app/AppRoutes";
import { AppState } from "../app/appStore";

export function renderApp({
  route = "/",
  state = {},
  ui,
}: {
  route?: string;
  state?: Partial<AppState>;
  ui?: ReactElement;
} = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppProvider initialState={{ ...defaultAppState, ...state }}>
        {ui ?? <AppRoutes />}
      </AppProvider>
    </MemoryRouter>,
  );
}
