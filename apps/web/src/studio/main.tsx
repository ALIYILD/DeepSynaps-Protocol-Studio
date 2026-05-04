import React from "react";
import { createRoot } from "react-dom/client";
import DatabasePage from "./database/DatabasePage";
import { EegViewer } from "./viewer/EegViewer";

const params = new URLSearchParams(window.location.search);
const recordingId = params.get("id") ?? "demo";
const app = params.get("app");

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {app === "database" ? <DatabasePage /> : <EegViewer recordingId={recordingId} />}
  </React.StrictMode>,
);
