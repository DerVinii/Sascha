import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { orgMembers, organizations } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export type ActiveOrg = {
  id: string;
  name: string;
  role: "owner" | "admin" | "sales" | "instructor" | "viewer";
};

/**
 * Returns the user's first/active organization, or null if they have none yet.
 * Multi-org switching kommt in Phase 2 — bis dahin: erste Org gewinnt.
 */
export async function getActiveOrg(): Promise<ActiveOrg | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      role: orgMembers.role,
    })
    .from(orgMembers)
    .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
    .where(eq(orgMembers.userId, user.id))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Variant that throws if no org — for routes that REQUIRE an org context.
 */
export async function requireActiveOrg(): Promise<ActiveOrg> {
  const org = await getActiveOrg();
  if (!org) {
    throw new Error("No active organization for user");
  }
  return org;
}

/**
 * Verify user is a member of given org_id (used in server actions for safety).
 */
export async function assertOrgAccess(orgId: string): Promise<ActiveOrg> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      role: orgMembers.role,
    })
    .from(orgMembers)
    .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
    .where(and(eq(orgMembers.userId, user.id), eq(orgMembers.orgId, orgId)))
    .limit(1);

  if (!rows[0]) throw new Error("No access to this organization");
  return rows[0];
}
