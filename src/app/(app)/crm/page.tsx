import { db } from "@/db";
import { contacts, companies, tags } from "@/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { requireActiveOrg } from "@/lib/server/active-org";
import { getOrgSettings } from "@/lib/server/org-settings";
import {
  parseContactFieldDefs,
  parseContactFieldValues,
} from "@/lib/contact-fields";
import { ContactsTable } from "./_components/contacts-table";

export const dynamic = "force-dynamic";

export default async function KontaktePage() {
  const org = await requireActiveOrg();

  const [list, settings, orgTags] = await Promise.all([
    db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        phone: contacts.phone,
        email: contacts.email,
        status: contacts.status,
        companyName: companies.name,
        domain: companies.domain,
        tags: contacts.tags,
        customFields: contacts.customFields,
      })
      .from(contacts)
      .leftJoin(companies, eq(contacts.companyId, companies.id))
      .where(eq(contacts.orgId, org.id))
      .orderBy(desc(contacts.createdAt))
      .limit(2000),
    getOrgSettings(org.id),
    db
      .select({ name: tags.name, color: tags.color })
      .from(tags)
      .where(eq(tags.orgId, org.id))
      .orderBy(asc(tags.name)),
  ]);

  const customColumns = parseContactFieldDefs(settings)
    .filter((d) => d.showInTable)
    .map((d) => ({ key: d.key, label: d.label, type: d.type }));

  // Nur die schlanken Feldwerte an den Client geben — custom_fields enthält
  // auch die (großen) Scraping-Namespaces, die hier niemand braucht.
  const rows = list.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    phone: c.phone,
    email: c.email,
    status: c.status,
    companyName: c.companyName,
    domain: c.domain,
    tags: c.tags,
    custom: parseContactFieldValues(c.customFields),
  }));

  const tagColors = Object.fromEntries(orgTags.map((t) => [t.name, t.color]));

  return (
    <ContactsTable
      contacts={rows}
      customColumns={customColumns}
      tagColors={tagColors}
    />
  );
}
