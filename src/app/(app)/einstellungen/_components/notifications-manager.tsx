"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Send } from "lucide-react";
import {
  getPushConfigAction,
  subscribePushAction,
  unsubscribePushAction,
  sendTestNotificationAction,
} from "../benachrichtigungen/actions";

type Support = "checking" | "unsupported" | "supported";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

export function NotificationsManager({
  serverConfigured,
  deviceCount,
}: {
  serverConfigured: boolean;
  deviceCount: number;
}) {
  const [support, setSupport] = useState<Support>("checking");
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    if (!ok) {
      setSupport("unsupported");
      return;
    }
    setSupport("supported");
    setPermission(Notification.permission);
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEnabled(!!sub))
      .catch(() => {});
  }, []);

  async function enable() {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const { configured, publicKey } = await getPushConfigAction();
      if (!configured || !publicKey) {
        setError(
          "Der Server ist noch nicht für Push konfiguriert. Bitte die VAPID-Umgebungsvariablen in Vercel setzen.",
        );
        return;
      }
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setError(
          perm === "denied"
            ? "Benachrichtigungen wurden blockiert. Erlaube sie in den Website-Einstellungen deines Browsers."
            : "Ohne deine Erlaubnis können keine Benachrichtigungen gesendet werden.",
        );
        return;
      }
      const reg = await ensureRegistration();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Ungültiges Abo");
      }
      await subscribePushAction({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      setEnabled(true);
      setInfo("Benachrichtigungen sind jetzt auf diesem Gerät aktiv.");
    } catch {
      setError("Aktivieren fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribePushAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setEnabled(false);
      setInfo("Benachrichtigungen wurden auf diesem Gerät deaktiviert.");
    } catch {
      setError("Deaktivieren fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const res = await sendTestNotificationAction();
      if (res.ok) setInfo(res.message);
      else setError(res.message);
    } catch {
      setError("Test fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  if (support === "checking") {
    return <p className="text-sm text-sub">Prüfe Browser-Unterstützung …</p>;
  }

  if (support === "unsupported") {
    return (
      <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5 text-sm text-ink">
        Dieser Browser unterstützt keine Push-Benachrichtigungen. Auf dem iPhone
        funktioniert es nur, wenn die App über „Teilen → Zum Home-Bildschirm"
        installiert und von dort geöffnet wird.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${
            enabled ? "bg-ok/10 text-ok" : "bg-bg text-sub"
          }`}
        >
          {enabled ? (
            <BellRing className="h-5 w-5" />
          ) : (
            <Bell className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink">
            {enabled
              ? "Auf diesem Gerät aktiviert"
              : "Auf diesem Gerät deaktiviert"}
          </div>
          <div className="text-[11px] text-sub">
            {deviceCount > 0
              ? `${deviceCount} Gerät${deviceCount === 1 ? "" : "e"} insgesamt angemeldet`
              : "Noch kein Gerät angemeldet"}
          </div>
        </div>
      </div>

      {!serverConfigured && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5 text-xs text-ink">
          Hinweis: Der Server ist noch nicht für Push konfiguriert. Setze in
          Vercel die Umgebungsvariablen{" "}
          <code className="bg-bg px-1 py-0.5 rounded border border-line break-all">
            VAPID_PUBLIC_KEY
          </code>
          ,{" "}
          <code className="bg-bg px-1 py-0.5 rounded border border-line break-all">
            VAPID_PRIVATE_KEY
          </code>{" "}
          und{" "}
          <code className="bg-bg px-1 py-0.5 rounded border border-line break-all">
            VAPID_SUBJECT
          </code>
          . Aktivieren geht danach.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {enabled ? (
          <>
            <button
              onClick={disable}
              disabled={busy}
              className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition disabled:opacity-50"
            >
              <BellOff className="h-4 w-4" />
              {busy ? "Bitte warten …" : "Deaktivieren"}
            </button>
            <button
              onClick={test}
              disabled={busy}
              className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Testbenachrichtigung
            </button>
          </>
        ) : (
          <button
            onClick={enable}
            disabled={busy}
            className="h-9 px-4 inline-flex items-center gap-1.5 rounded-md bg-brand text-white text-sm font-medium hover:bg-sidebar-soft transition disabled:opacity-50"
          >
            <Bell className="h-4 w-4" />
            {busy ? "Wird aktiviert …" : "Benachrichtigungen aktivieren"}
          </button>
        )}
      </div>

      {permission === "denied" && !enabled && (
        <p className="text-xs text-sub">
          Benachrichtigungen sind im Browser blockiert. Erlaube sie in den
          Website-Einstellungen (Schloss-Symbol neben der Adresse), dann hier
          erneut aktivieren.
        </p>
      )}
      {info && <p className="text-xs text-ok">{info}</p>}
      {error && <p className="text-xs text-err">{error}</p>}
    </div>
  );
}
