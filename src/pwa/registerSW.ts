export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("/sw.js");
    } catch {
      // ignore
    }
  });
}