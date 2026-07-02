import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireActiveOrg } from "@/lib/server/active-org";
import { ContactsTable } from "./_components/contacts-table";

export const dynamic = "force-dynamic";

export default async function KontaktePage() {
  const org = await requireActiveOrg();

  const list = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      phone: contacts.phone,
      email: contacts.email,
      companyName: companies.name,
      domain: companies.domain,
    })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(eq(contacts.orgId, org.id))
    .orderBy(desc(contacts.createdAt))
    .limit(2000);

  return <ContactsTable contacts={list} />;
}
