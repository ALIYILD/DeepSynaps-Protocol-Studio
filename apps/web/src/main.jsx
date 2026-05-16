/**
 * DeepSynaps Protocol Studio — Entry point.
 *
 * Mounts the appropriate React component based on the URL path.
 * Used for both unit tests and E2E test harness.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import SynthesisDashboard from "./pages-deeptwin/SynthesisDashboard";
import DeepTwinPage from "./pages-deeptwin/DeepTwinPage";
import DemoModeBanner from "./components/DemoModeBanner";

/**
 * App shell — wraps all pages with the demo banner and routing.
 */
function App() {
  return (
    <>
      <DemoModeBanner />
      <Routes>
        <Route
          path="/pages-deeptwin/synthesis-dashboard"
          element={<SynthesisDashboard />}
        />
        <Route
          path="/pages-deeptwin/deeptwin"
          element={<DeepTwinPage />}
        />
        <Route
          path="/"
          element={<SynthesisDashboard />}
        />
      </Routes>
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
