import { ShieldCheck, ShieldAlert } from "lucide-react";
import { LogoutButton } from "../_components/logout-button";

export const dynamic = "force-dynamic";

export default function SicherheitPage() {
  const active = !!process.env.APP_PASSWORD?.trim();

  return (
    <>
      <div className="rounded-xl border border-line bg-surface p-5">
        <div className="flex items-start gap-3">
          <div
            className={`h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-lg ${
              active ? "bg-ok/10 text-ok" : "bg-err/10 text-err"
            }`}
          >
            {active ? (
              <ShieldCheck className="h-5 w-5" />
            ) : (
              <ShieldAlert className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">
              Zugriffsschutz {active ? "aktiv" : "nicht aktiv"}
            </h2>
            {active ? (
              <p className="text-xs text-sub mt-1">
                Die App ist mit einem Passwort geschützt. Ohne Anmeldung sind
                weder Seiten noch Daten erreichbar.
              </p>
            ) : (
              <p className="text-xs text-sub mt-1">
                <span className="text-err font-medium">
                  Die App ist aktuell öffentlich
                </span>{" "}
                — jeder mit der URL kann alle Kontakte, Deals und E-Mails sehen
                und ändern.
              </p>
            )}
          </div>
        </div>
        {active && (
          <div className="mt-4 pt-4 border-t border-line">
            <LogoutButton />
          </div>
        )}
      </div>

      {!active && (
        <div className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink mb-3">
            So aktivierst du den Schutz
          </h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-ink">
            <li>
              In Vercel das Projekt öffnen → <b>Settings</b> →{" "}
              <b>Environment Variables</b>.
            </li>
            <li>
              Variable{" "}
              <code className="text-xs bg-bg px-1 py-0.5 rounded border border-line">
                APP_PASSWORD
              </code>{" "}
              mit dem gewünschten Passwort anlegen (Environment: Production).
            </li>
            <li>Ein Redeploy auslösen (oder den nächsten Push abwarten).</li>
          </ol>
          <p className="text-[11px] text-sub mt-3">
            Danach verlangt die App vor jeder Nutzung das Passwort (gültig 30
            Tage pro Gerät). Die technischen Endpunkte für Instantly-Webhooks
            und den Scraping-Selbsttest bleiben über ihre eigenen Tokens
            geschützt und funktionieren weiter.
          </p>
        </div>
      )}
    </>
  );
}
