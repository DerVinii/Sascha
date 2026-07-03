import { requireActiveOrg } from "@/lib/server/active-org";
import { getOrgSettings } from "@/lib/server/org-settings";
import { parseContactFieldDefs } from "@/lib/contact-fields";
import { FieldsManager } from "../_components/fields-manager";

export const dynamic = "force-dynamic";

export default async function KontaktfelderPage() {
  const org = await requireActiveOrg();
  const fields = parseContactFieldDefs(await getOrgSettings(org.id));

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink mb-1">
        Individuelle Kontaktfelder
      </h2>
      <p className="text-xs text-sub mb-4">
        Eigene Felder für Kontakte — erscheinen auf der Kontakt-Detailseite
        und optional als Spalte in der Kontakte-Tabelle.
      </p>
      <FieldsManager fields={fields} />
    </div>
  );
}
