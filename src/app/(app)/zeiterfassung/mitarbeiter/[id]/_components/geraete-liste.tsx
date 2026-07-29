"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Smartphone } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/zeiterfassung";
import { revokeDevice } from "../../../actions";

export type Geraet = {
  id: string;
  label: string | null;
  userAgent: string | null;
  /** ISO-String */
  enrolledAt: string;
  /** ISO-String */
  lastSeenAt: string;
  revoked: boolean;
};

/** Grober Gerätename: erst das Label, sonst aus dem User-Agent geraten. */
function geraeteName(label: string | null, userAgent: string | null): string {
  const eigen = label?.trim();
  if (eigen) return eigen;
  const ua = userAgent ?? "";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows-PC";
  return "Unbekannt";
}

export function GeraeteListe({ geraete }: { geraete: Geraet[] }) {
  const router = useRouter();
  const [abmelden, setAbmelden] = useState<Geraet | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!abmelden) return;
    function beiTaste(e: KeyboardEvent) {
      if (e.key === "Escape") setAbmelden(null);
    }
    document.addEventListener("keydown", beiTaste);
    return () => document.removeEventListener("keydown", beiTaste);
  }, [abmelden]);

  function bestaetigen() {
    if (!abmelden) return;
    setFehler(null);
    const id = abmelden.id;
    startTransition(async () => {
      try {
        const res = await revokeDevice(id);
        if (!res.ok) {
          setFehler(res.error);
          return;
        }
        setAbmelden(null);
        router.refresh();
      } catch {
        setFehler("Abmelden fehlgeschlagen. Bitte erneut versuchen.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-5 space-y-3">
      <h2 className="text-sm font-semibold text-ink">Geräte</h2>

      {geraete.length === 0 ? (
        <p className="text-sm text-sub">Noch kein Gerät gekoppelt.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-sub font-medium text-left">
                <th className="py-1 pr-3 font-medium">Gerät</th>
                <th className="py-1 pr-3 font-medium">Eingerichtet</th>
                <th className="py-1 pr-3 font-medium">Zuletzt aktiv</th>
                <th className="py-1 pr-3 font-medium">Status</th>
                <th className="py-1 font-medium text-right">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {geraete.map((g) => (
                <tr
                  key={g.id}
                  className={cn(
                    "border-t border-line",
                    g.revoked && "opacity-50",
                  )}
                >
                  <td className="py-2 pr-3 text-ink">
                    <span className="inline-flex items-center gap-1.5">
                      <Smartphone className="h-3.5 w-3.5 text-sub" />
                      {geraeteName(g.label, g.userAgent)}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-sub whitespace-nowrap">
                    {formatDateTime(g.enrolledAt)}
                  </td>
                  <td className="py-2 pr-3 text-sub whitespace-nowrap">
                    {formatDateTime(g.lastSeenAt)}
                  </td>
                  <td className="py-2 pr-3">
                    {g.revoked ? (
                      <span className="pill bg-line text-sub">Abgemeldet</span>
                    ) : (
                      <span className="pill bg-ok/10 text-ok">Aktiv</span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {!g.revoked && (
                      <button
                        type="button"
                        onClick={() => setAbmelden(g)}
                        className="text-xs text-err hover:underline"
                      >
                        Abmelden
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {fehler && !abmelden && <p className="text-xs text-err">{fehler}</p>}

      {abmelden && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setAbmelden(null);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="rounded-xl border border-line bg-surface p-5 w-full max-w-md space-y-3">
            <h2 className="text-sm font-semibold text-ink">Gerät abmelden?</h2>
            <p className="text-sm text-ink">
              „{geraeteName(abmelden.label, abmelden.userAgent)}“ kann danach
              nicht mehr stempeln. Bereits erfasste Zeiten bleiben erhalten. Zum
              Weiterarbeiten muss ein neuer QR-Code gescannt werden.
            </p>
            {fehler && <p className="text-xs text-err">{fehler}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAbmelden(null)}
                disabled={pending}
                className="h-9 px-3 rounded-md text-sm font-medium border border-line bg-surface text-ink hover:bg-bg disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={bestaetigen}
                disabled={pending}
                className="h-9 px-3 rounded-md text-sm font-medium bg-err text-white hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Wird abgemeldet …" : "Abmelden"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
