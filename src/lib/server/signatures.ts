/**
 * Datenzugriff für E-Mail-Signaturen. Wird sowohl von der Postfach-Seite
 * (Server-Component) als auch von den Server-Actions genutzt.
 *
 * Nur serverseitig importieren.
 */

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { emailSignatures } from "@/db/schema";
import { sanitizeEmailHtml, type EmailSignature } from "@/lib/signature";

const COLUMNS = {
  id: emailSignatures.id,
  name: emailSignatures.name,
  html: emailSignatures.html,
};

export async function listSignatures(orgId: string): Promise<EmailSignature[]> {
  return db
    .select(COLUMNS)
    .from(emailSignatures)
    .where(eq(emailSignatures.orgId, orgId))
    .orderBy(asc(emailSignatures.createdAt));
}

/**
 * Liest die Signaturen und schluckt Fehler (z. B. wenn die Tabelle auf einer
 * Umgebung noch fehlt) — das Postfach soll deswegen nicht ausfallen.
 */
export async function listSignaturesSafe(
  orgId: string,
): Promise<EmailSignature[]> {
  try {
    return await listSignatures(orgId);
  } catch {
    return [];
  }
}

export async function createSignature(
  orgId: string,
  name: string,
): Promise<EmailSignature[]> {
  await db.insert(emailSignatures).values({ orgId, name, html: "" });
  return listSignatures(orgId);
}

export async function updateSignature(
  orgId: string,
  id: string,
  patch: { name?: string; html?: string },
): Promise<EmailSignature[]> {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.html !== undefined) values.html = sanitizeEmailHtml(patch.html);

  await db
    .update(emailSignatures)
    .set(values)
    .where(and(eq(emailSignatures.orgId, orgId), eq(emailSignatures.id, id)));
  return listSignatures(orgId);
}

export async function deleteSignature(
  orgId: string,
  id: string,
): Promise<EmailSignature[]> {
  await db
    .delete(emailSignatures)
    .where(and(eq(emailSignatures.orgId, orgId), eq(emailSignatures.id, id)));
  return listSignatures(orgId);
}
