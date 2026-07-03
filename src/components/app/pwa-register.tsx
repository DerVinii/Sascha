"use client";

import { useEffect } from "react";

/** Registriert den Service Worker (PWA + Push) einmalig beim Laden. */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* Registrierung fehlgeschlagen — App funktioniert weiter ohne PWA/Push */
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
