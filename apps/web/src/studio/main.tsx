import React from "react";
import { createRoot } from "react-dom/client";
import { EegViewer } from "./viewer/EegViewer";

const params = new URLSearchParams(window.location.search);
const recordingId = params.get("id") ?? "demo";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <EegViewer recordingId={recordingId} />
  </React.StrictMode>,
);
