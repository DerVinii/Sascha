"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Chrome bietet die Installation über ein abfangbares Ereignis an. Safari nicht —
 * dort führt kein Weg an einer Anleitung vorbei.
 */
type InstallEreignis = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Plattform = "ios" | "android" | "sonstige";

function erkennePlattform(): Plattform {
  const ua = navigator.userAgent;
  // iPadOS meldet sich seit Version 13 als Macintosh — der Touch-Punkt verrät es.
  const istIpad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || istIpad) return "ios";
  if (/Android/.test(ua)) return "android";
  return "sonstige";
}

function laeuftAlsApp(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari auf iOS kennt display-mode nicht zuverlässig, dafür dieses Flag.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function Installieren() {
  const router = useRouter();
  const [plattform, setPlattform] = useState<Plattform | null>(null);
  const [installEreignis, setInstallEreignis] =
    useState<InstallEreignis | null>(null);
  const [installiert, setInstalliert] = useState(false);

  useEffect(() => {
    // Läuft die Seite bereits in der installierten App, ist diese Anleitung
    // gegenstandslos — dann direkt zur Stempeluhr.
    if (laeuftAlsApp()) {
      router.replace("/zeit/stempel");
      return;
    }
    setPlattform(erkennePlattform());

    const abfangen = (e: Event) => {
      e.preventDefault();
      setInstallEreignis(e as InstallEreignis);
    };
    window.addEventListener("beforeinstallprompt", abfangen);
    window.addEventListener("appinstalled", () => setInstalliert(true));
    return () => window.removeEventListener("beforeinstallprompt", abfangen);
  }, [router]);

  async function installieren() {
    if (!installEreignis) return;
    await installEreignis.prompt();
    const { outcome } = await installEreignis.userChoice;
    if (outcome === "accepted") setInstalliert(true);
    setInstallEreignis(null);
  }

  // Vor dem Mounten wissen wir die Plattform nicht — bis dahin nichts anzeigen,
  // damit nicht kurz die falsche Anleitung aufblitzt.
  if (plattform === null) {
    return <div className="h-40" aria-hidden />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-ink">
          Stempeluhr aufs Handy holen
        </h2>
        <p className="mt-2 text-sm text-sub">
          Leg dir die Stempeluhr als eigene App auf den Startbildschirm. Danach
          brauchst du zum Ein- und Ausstempeln nur noch einen Tipp.
        </p>

        {installiert ? (
          <p className="mt-4 rounded-md bg-ok/10 px-3 py-2 text-sm text-ok">
            Fertig. Schließe diese Seite und öffne die App über das neue Symbol
            auf dem Startbildschirm.
          </p>
        ) : plattform === "ios" ? (
          <AnleitungIos />
        ) : plattform === "android" ? (
          <AnleitungAndroid
            installEreignis={installEreignis}
            onInstallieren={installieren}
          />
        ) : (
          <AnleitungSonstige />
        )}
      </div>

      <div className="rounded-xl border border-line bg-surface p-5">
        <h3 className="text-sm font-semibold text-ink">Danach</h3>
        <p className="mt-2 text-sm text-sub">
          Öffne die App über das neue Symbol und trag den Code ein, den Sascha
          dir nennt. Damit ist das Handy dauerhaft angemeldet.
        </p>
        <p className="mt-3 rounded-md bg-warn/10 px-3 py-2 text-xs text-warn">
          Wichtig: Benutze zum Stempeln immer das Symbol auf dem
          Startbildschirm, nicht den Browser. Der Browser gilt auf manchen
          Handys als getrennte Anwendung und kennt deine Anmeldung dann nicht.
        </p>
      </div>

      <p className="text-center text-xs text-sub">
        Schon eingerichtet?{" "}
        <Link
          href="/zeit/stempel"
          className="underline underline-offset-4 hover:text-ink"
        >
          Direkt zur Stempeluhr
        </Link>
      </p>
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

function AnleitungIos() {
  return (
    <>
      <Schritte
        schritte={[
          <>
            Tippe unten in der Leiste auf <strong>Teilen</strong> — das Symbol
            mit dem Pfeil nach oben.
          </>,
          <>
            Wische in der Liste nach unten und wähle{" "}
            <strong>Zum Home-Bildschirm</strong>.
          </>,
          <>
            Bestätige oben rechts mit <strong>Hinzufügen</strong>.
          </>,
        ]}
      />
      <p className="mt-4 text-xs text-sub">
        Das geht nur in Safari. Falls du diese Seite gerade in einem anderen
        Browser oder aus WhatsApp heraus geöffnet hast, öffne sie zuerst in
        Safari.
      </p>
    </>
  );
}

function AnleitungAndroid({
  installEreignis,
  onInstallieren,
}: {
  installEreignis: InstallEreignis | null;
  onInstallieren: () => void;
}) {
  if (installEreignis) {
    return (
      <button
        type="button"
        onClick={onInstallieren}
        className="mt-4 h-11 w-full rounded-md bg-brand text-sm font-medium text-white hover:opacity-90"
      >
        App installieren
      </button>
    );
  }

  // Ohne das Ereignis (schon installiert, anderer Browser, oder Chrome hat es
  // noch nicht ausgelöst) bleibt der Weg über das Menü.
  return (
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
          Bestätige mit <strong>Installieren</strong>.
        </>,
      ]}
    />
  );
}

function AnleitungSonstige() {
  return (
    <p className="mt-4 text-sm text-sub">
      Öffne diese Seite auf deinem Handy — dort kannst du die Stempeluhr als App
      auf den Startbildschirm legen. Am Rechner funktioniert das Stempeln auch
      ohne Installation direkt im Browser.
    </p>
  );
}
