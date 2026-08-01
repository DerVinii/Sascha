"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Apple, Smartphone } from "lucide-react";
import { einladungEinloesen } from "../actions";

type InstallEreignis = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Geraet = "iphone" | "android";

/** Läuft die Seite in der installierten App statt im Browser? */
function laeuftAlsApp(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari auf iOS meldet den Modus nicht über display-mode.
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

export function Einrichtung({
  token,
  vorname,
}: {
  token: string;
  vorname: string;
}) {
  const router = useRouter();
  const [geraet, setGeraet] = useState<Geraet | null>(null);
  const [koppelt, setKoppelt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [installEreignis, setInstallEreignis] =
    useState<InstallEreignis | null>(null);

  const koppeln = useCallback(async () => {
    setKoppelt(true);
    setFehler(null);
    try {
      const ergebnis = await einladungEinloesen(token);
      if (!ergebnis.ok) {
        setFehler(ergebnis.error);
        setKoppelt(false);
        return;
      }
      // Ab hier ist das Gerät angemeldet — direkt zur Stempeluhr.
      router.replace("/zeit/stempel");
    } catch {
      setFehler(
        "Das hat nicht geklappt. Prüf bitte deine Internetverbindung und versuch es noch einmal.",
      );
      setKoppelt(false);
    }
  }, [token, router]);

  useEffect(() => {
    // Der eigentliche Moment der Einrichtung: Die App startet zum ersten Mal
    // und meldet sich selbst an. Vorher, im Browser, passiert bewusst nichts.
    //
    // Die Anleitung wird bis dahin ganz normal gerendert — auch schon vom
    // Server. Ein „warte, ich prüfe erst"-Platzhalter würde jeden Mitarbeiter
    // im Browser einen leeren Kasten sehen lassen, nur damit der seltene
    // App-Start eine Zehntelsekunde ruhiger aussieht.
    if (laeuftAlsApp()) void koppeln();

    const abfangen = (e: Event) => {
      e.preventDefault();
      setInstallEreignis(e as InstallEreignis);
    };
    window.addEventListener("beforeinstallprompt", abfangen);
    return () => window.removeEventListener("beforeinstallprompt", abfangen);
  }, [koppeln]);

  async function jetztInstallieren() {
    if (!installEreignis) return;
    await installEreignis.prompt();
    await installEreignis.userChoice;
    setInstallEreignis(null);
  }

  if (koppelt) {
    return (
      <div className="rounded-xl border border-line bg-surface p-5 text-center">
        <p className="text-sm text-ink">Einen Moment, wird eingerichtet …</p>
      </div>
    );
  }

  if (fehler) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-ink">
            Einrichtung fehlgeschlagen
          </h2>
          <p className="mt-2 text-sm text-err">{fehler}</p>
        </div>
        <button
          type="button"
          onClick={() => void koppeln()}
          className="h-11 w-full rounded-md bg-brand text-sm font-medium text-white hover:opacity-90"
        >
          Noch einmal versuchen
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-ink">Hallo {vorname}</h2>
        <p className="mt-2 text-sm text-sub">
          Leg dir die Stempeluhr als App auf den Startbildschirm. Danach bist du
          angemeldet und kannst mit einem Tipp ein- und ausstempeln.
        </p>

        {geraet === null ? (
          <>
            <p className="mt-4 text-sm font-medium text-ink">
              Was für ein Handy hast du?
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGeraet("iphone")}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-line bg-bg px-3 py-4 text-sm font-medium text-ink hover:border-accent hover:bg-accent-faint"
              >
                <Apple className="h-6 w-6" />
                iPhone
              </button>
              <button
                type="button"
                onClick={() => setGeraet("android")}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-line bg-bg px-3 py-4 text-sm font-medium text-ink hover:border-accent hover:bg-accent-faint"
              >
                <Smartphone className="h-6 w-6" />
                Android
              </button>
            </div>
          </>
        ) : geraet === "iphone" ? (
          <AnleitungIphone onZurueck={() => setGeraet(null)} />
        ) : (
          <AnleitungAndroid
            onZurueck={() => setGeraet(null)}
            installEreignis={installEreignis}
            onInstallieren={jetztInstallieren}
          />
        )}
      </div>

      {geraet !== null && (
        <div className="rounded-xl border border-line bg-surface p-5">
          <p className="text-sm text-ink">
            Sobald die App auf dem Startbildschirm liegt: öffne sie über das
            neue Symbol. Damit ist die Einrichtung erledigt — du musst nichts
            weiter eintippen.
          </p>
          <p className="mt-3 text-xs text-sub">
            Stempel danach immer über das Symbol auf dem Startbildschirm, nicht
            über den Browser.
          </p>
        </div>
      )}

      {/* Rückfalltür für Rechner oder wenn die Installation partout nicht geht.
          Bewusst unscheinbar: Wer hier koppelt, verbraucht die Einladung im
          Browser — auf dem iPhone ist die App danach NICHT angemeldet. */}
      <details className="rounded-xl border border-line bg-surface p-4">
        <summary className="cursor-pointer text-xs text-sub">
          Installation klappt nicht?
        </summary>
        <p className="mt-2 text-xs text-sub">
          Du kannst dich auch ohne Installation direkt in diesem Browser
          anmelden. Auf dem iPhone gilt die Anmeldung dann allerdings nur hier
          im Browser — nicht in einer später installierten App.
        </p>
        <button
          type="button"
          onClick={() => void koppeln()}
          className="mt-3 h-11 md:h-9 w-full rounded-md border border-line bg-surface text-sm font-medium text-ink hover:bg-bg"
        >
          Hier im Browser anmelden
        </button>
      </details>
    </div>
  );
}

function Schritte({ schritte }: { schritte: React.ReactNode[] }) {
  return (
    <ol className="mt-4 space-y-3">
      {schritte.map((schritt, i) => (
        <li key={i} className="flex gap-3 text-sm text-ink">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-faint text-xs font-semibold text-accent">
            {i + 1}
          </span>
          <span className="pt-0.5">{schritt}</span>
        </li>
      ))}
    </ol>
  );
}

function ZurueckKnopf({ onZurueck }: { onZurueck: () => void }) {
  return (
    <button
      type="button"
      onClick={onZurueck}
      className="mt-4 text-xs text-sub underline underline-offset-4 hover:text-ink"
    >
      Anderes Handy wählen
    </button>
  );
}

function AnleitungIphone({ onZurueck }: { onZurueck: () => void }) {
  return (
    <>
      <p className="mt-4 text-sm font-medium text-ink">So geht es am iPhone</p>
      <Schritte
        schritte={[
          <>
            Tippe unten in der Leiste auf <strong>Teilen</strong> — das Quadrat
            mit dem Pfeil nach oben.
          </>,
          <>
            Wische in der Liste nach unten und wähle{" "}
            <strong>Zum Home-Bildschirm</strong>.
          </>,
          <>
            Bestätige oben rechts mit <strong>Hinzufügen</strong>.
          </>,
          <>
            Öffne die App über das neue Symbol <strong>SK Zeit</strong>.
          </>,
        ]}
      />
      <p className="mt-4 rounded-md bg-warn/10 px-3 py-2 text-xs text-warn">
        Das funktioniert nur in Safari. Wenn du diesen Link gerade aus WhatsApp
        heraus geöffnet hast, tippe zuerst auf das Teilen-Symbol und wähle{" "}
        <strong>In Safari öffnen</strong>.
      </p>
      <ZurueckKnopf onZurueck={onZurueck} />
    </>
  );
}

function AnleitungAndroid({
  onZurueck,
  installEreignis,
  onInstallieren,
}: {
  onZurueck: () => void;
  installEreignis: InstallEreignis | null;
  onInstallieren: () => void;
}) {
  return (
    <>
      <p className="mt-4 text-sm font-medium text-ink">So geht es am Android</p>
      {installEreignis ? (
        <>
          <button
            type="button"
            onClick={onInstallieren}
            className="mt-3 h-11 w-full rounded-md bg-brand text-sm font-medium text-white hover:opacity-90"
          >
            App installieren
          </button>
          <p className="mt-2 text-xs text-sub">
            Danach die App über das neue Symbol <strong>SK Zeit</strong> öffnen.
          </p>
        </>
      ) : (
        <Schritte
          schritte={[
            <>
              Tippe oben rechts auf die <strong>drei Punkte</strong>.
            </>,
            <>
              Wähle <strong>App installieren</strong> oder{" "}
              <strong>Zum Startbildschirm hinzufügen</strong>.
            </>,
            <>
              Öffne die App über das neue Symbol <strong>SK Zeit</strong>.
            </>,
          ]}
        />
      )}
      <ZurueckKnopf onZurueck={onZurueck} />
    </>
  );
}
