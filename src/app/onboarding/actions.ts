"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { organizations, orgMembers, pipelines, pipelineStages } from "@/db/schema";
import { eq } from "drizzle-orm";

const DEFAULT_STAGES = [
  { name: "Lead", position: 0, probability: 10, color: "#fef3c7" },
  { name: "Qualified", position: 1, probability: 25, color: "#dbeafe" },
  { name: "In Conversation", position: 2, probability: 40, color: "#dbeafe" },
  { name: "Termin gebucht", position: 3, probability: 60, color: "#fed7aa" },
  { name: "Closed Won", position: 4, probability: 100, color: "#d1fae5" },
  { name: "Closed Lost", position: 5, probability: 0, color: "#fee2e2" },
];

export async function createOrgAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("Name darf nicht leer sein");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Doppelt absichern: hat der User schon eine Org?
  const existing = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(eq(orgMembers.userId, user.id))
    .limit(1);
  if (existing[0]) {
    redirect("/dashboard");
  }

  // Org + Membership + Default-Pipeline in einer Transaction
  await db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({ name })
      .returning({ id: organizations.id });

    await tx.insert(orgMembers).values({
      userId: user.id,
      orgId: org.id,
      role: "owner",
    });

    const [pipeline] = await tx
      .insert(pipelines)
      .values({ orgId: org.id, name: "Standard-Pipeline", isDefault: true })
      .returning({ id: pipelines.id });

    await tx.insert(pipelineStages).values(
      DEFAULT_STAGES.map((s) => ({
        pipelineId: pipeline.id,
        name: s.name,
        position: s.position,
        probability: s.probability,
        color: s.color,
      })),
    );
  });

  redirect("/dashboard");
}
