import { Inbox, AlertTriangle } from "lucide-react";
import { getMailboxConfig } from "@/lib/server/mailbox/config";
import { listFolders, listMessages } from "@/lib/server/mailbox/imap";
import { folderSortRank } from "@/lib/mailbox-ui";
import { MailboxView } from "./_components/mailbox-view";

export const dynamic = "force-dynamic";

export default async function PostfachPage() {
  const cfg = getMailboxConfig();

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
    const folders = (await listFolders()).sort(
      (a, b) => folderSortRank(a) - folderSortRank(b) || a.name.localeCompare(b.name),
    );
    const inbox = folders.find((f) => f.specialUse === "\\Inbox") ?? folders[0];
    const initialList = inbox
      ? await listMessages(inbox.path, {})
      : { items: [], total: 0 };

    return (
      <MailboxView
        folders={folders}
        initialFolder={inbox?.path ?? "INBOX"}
        initialList={initialList}
        senderEmail={cfg.email}
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
