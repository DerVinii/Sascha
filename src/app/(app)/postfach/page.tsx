import { Inbox, AlertTriangle } from "lucide-react";
import { getMailboxConfig } from "@/lib/server/mailbox/config";
import { getMailboxOverview } from "@/lib/server/mailbox/imap";
import { folderSortRank } from "@/lib/mailbox-ui";
import { MailboxView } from "./_components/mailbox-view";

export const dynamic = "force-dynamic";

export default async function PostfachPage({
  searchParams,
}: {
  searchParams: Promise<{ compose?: string | string[] }>;
}) {
  const cfg = getMailboxConfig();
  const sp = await searchParams;
  // Wird aus dem Kontakt-Panel („E-Mail schreiben") gesetzt: öffnet direkt
  // den Verfassen-Dialog mit vorausgefülltem Empfänger.
  const composeTo =
    typeof sp.compose === "string" && sp.compose.trim()
      ? sp.compose.trim()
      : undefined;

  if (!cfg) {
    return (
      <EmptyBox
        icon={<Inbox className="h-8 w-8 text-sub/50" />}
        title="Kein Postfach verbunden"
        text="Es sind keine Zugangsdaten hinterlegt (POSTFACH_EMAIL / POSTFACH_PASSWORD). Sobald das Postfach verbunden ist, erscheinen hier Ordner und E-Mails."
      />
    );
  }

  try {
    // Ordner + erste Inbox-Seite kommen in EINER IMAP-Verbindung.
    const overview = await getMailboxOverview();
    const folders = overview.folders.sort(
      (a, b) => folderSortRank(a) - folderSortRank(b) || a.name.localeCompare(b.name),
    );

    return (
      <MailboxView
        folders={folders}
        initialFolder={overview.inboxPath}
        initialList={overview.list}
        senderEmail={cfg.email}
        initialComposeTo={composeTo}
      />
    );
  } catch (err) {
    return (
      <EmptyBox
        icon={<AlertTriangle className="h-8 w-8 text-err/70" />}
        title="Postfach nicht erreichbar"
        text={`Verbindung zu ${cfg.imapHost} fehlgeschlagen: ${
          err instanceof Error ? err.message : "unbekannter Fehler"
        }`}
      />
    );
  }
}

function EmptyBox({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="p-4 md:p-6 h-full">
      <div className="h-full flex items-center justify-center rounded-xl border border-line bg-surface">
        <div className="max-w-sm text-center px-6">
          <div className="mx-auto mb-3 flex justify-center">{icon}</div>
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="text-xs text-sub mt-1.5 leading-relaxed">{text}</p>
        </div>
      </div>
    </div>
  );
}
