console.log('[TRAINLAB] main.tsx executing');

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./progress.css";
import { registerServiceWorker } from "./pwa/registerSW";
import { processQueue } from "./lib/offlineQueue";
import { SplashScreen } from '@capacitor/splash-screen';

try {
  setTimeout(() => {
    SplashScreen.hide();
  }, 2500);

  if (import.meta.env.PROD) { registerServiceWorker(); }
  void processQueue();

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  console.log('[TRAINLAB] React mounted');
} catch(e: any) {
  document.body.innerHTML = '<pre style="color:red;padding:20px;">FATAL: ' + e.message + '\n' + e.stack + '</pre>';
}
