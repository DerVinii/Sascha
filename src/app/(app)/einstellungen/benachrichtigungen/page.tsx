import { requireActiveOrg } from "@/lib/server/active-org";
import {
  isPushConfigured,
  countSubscriptions,
  getPushEventPrefs,
} from "@/lib/server/push";
import { NotificationsManager } from "../_components/notifications-manager";
import { NotificationEvents } from "../_components/notification-events";

export const dynamic = "force-dynamic";

export default async function BenachrichtigungenPage() {
  const org = await requireActiveOrg();
  const configured = await isPushConfigured();
  const deviceCount = configured ? await countSubscriptions(org.id) : 0;
  const prefs = await getPushEventPrefs(org.id);

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
        <h2 className="text-sm font-semibold text-ink mb-1">
          Wobei du benachrichtigt wirst
        </h2>
        <p className="text-xs text-sub mb-4">
          Wähle aus, was eine Benachrichtigung auslösen soll. Änderungen gelten
          sofort.
        </p>
        <NotificationEvents prefs={prefs} />
        <p className="text-[11px] text-sub mt-4">
          Benachrichtigungen funktionieren am zuverlässigsten, wenn die App zum
          Startbildschirm hinzugefügt (installiert) ist.
        </p>
      </div>
    </>
  );
}
