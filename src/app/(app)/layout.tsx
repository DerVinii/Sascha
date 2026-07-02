import { getActiveOrg } from "@/lib/server/active-org";
import { Sidebar } from "@/components/app/sidebar";
import { Header } from "@/components/app/header";
import { db } from "@/db";
import { pipelines } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

// DB-gebundene App-Routes zur Laufzeit rendern (Live-Daten), nicht beim Build
// statisch prerendern. Greift für das gesamte (app)-Segment.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const org = await getActiveOrg();

  const sidebarPipelines = org
    ? await db
        .select({ id: pipelines.id, name: pipelines.name })
        .from(pipelines)
        .where(eq(pipelines.orgId, org.id))
        .orderBy(asc(pipelines.position), asc(pipelines.createdAt))
    : [];

  if (!org) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-bg px-4">
        <div className="max-w-md w-full bg-surface border border-line rounded-xl p-6 text-center space-y-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-err/10 text-err font-bold text-lg mx-auto">
            !
          </div>
          <h1 className="text-base font-semibold text-ink">
            Keine Organisation gefunden
          </h1>
          <p className="text-sm text-sub">
            In der Datenbank existiert noch keine Organisation. Lege sie über{" "}
            <code className="text-xs bg-bg px-1 py-0.5 rounded border border-line">
              npm run seed
            </code>{" "}
            an.
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar orgName={org.name} pipelines={sidebarPipelines} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
