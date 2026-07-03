import { requireActiveOrg } from "@/lib/server/active-org";
import { isPushConfigured, countSubscriptions } from "@/lib/server/push";
import { NotificationsManager } from "../_components/notifications-manager";

export const dynamic = "force-dynamic";

export default async function BenachrichtigungenPage() {
  const org = await requireActiveOrg();
  const configured = isPushConfigured();
  const deviceCount = configured ? await countSubscriptions(org.id) : 0;

  return (
    <>
      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink mb-1">
          Benachrichtigungen
        </h2>
        <p className="text-xs text-sub mb-4">
          Erhalte eine Push-Benachrichtigung auf dieses Gerät, sobald etwas
          Wichtiges passiert — zum Beispiel, wenn ein neuer Lead reinkommt oder
          ein Lead auf eine Kampagne antwortet.
        </p>
        <NotificationsManager
          serverConfigured={configured}
          deviceCount={deviceCount}
        />
      </div>

      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink mb-2">
          Wobei du benachrichtigt wirst
        </h2>
        <ul className="space-y-1.5 text-sm text-ink">
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
            Neuer Kontakt/Lead wurde angelegt
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
            Ein Lead hat auf eine Instantly-Kampagne geantwortet
          </li>
        </ul>
        <p className="text-[11px] text-sub mt-3">
          Benachrichtigungen funktionieren am zuverlässigsten, wenn die App zum
          Startbildschirm hinzugefügt (installiert) ist.
        </p>
      </div>
    </>
  );
}
