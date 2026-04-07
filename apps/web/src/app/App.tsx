import { BrowserRouter } from "react-router-dom";

import { AppErrorBoundary } from "../components/system/AppErrorBoundary";
import { AppProvider } from "./AppContext";
import { AppRoutes } from "./AppRoutes";

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppErrorBoundary>
          <AppRoutes />
        </AppErrorBoundary>
      </AppProvider>
    </BrowserRouter>
  );
}
