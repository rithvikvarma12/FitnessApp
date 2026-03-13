import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./progress.css";
import { registerServiceWorker } from "./pwa/registerSW";
import { processQueue } from "./lib/offlineQueue";
import { SplashScreen } from '@capacitor/splash-screen';

SplashScreen.hide();

if (import.meta.env.PROD) { registerServiceWorker(); }
void processQueue();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Fade out HTML splash after React has mounted
setTimeout(() => {
  const splash = document.getElementById('app-splash');
  if (splash) {
    splash.style.opacity = '0';
    setTimeout(() => splash.remove(), 400);
  }
}, 2800);
