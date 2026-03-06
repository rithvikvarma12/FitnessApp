import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./progress.css";
import { registerServiceWorker } from "./pwa/registerSW";

if (import.meta.env.PROD) { registerServiceWorker(); }

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);