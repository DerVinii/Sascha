"use server";

import { requireActiveOrg } from "@/lib/server/active-org";
import {
  createSignature,
  deleteSignature,
  listSignatures,
  setDefaultSignature,
  updateSignature,
} from "@/lib/server/signatures";
import type { EmailSignature } from "@/lib/signature";

// Alle Actions geben die vollständige, frische Liste zurück — der Dialog
// übernimmt sie direkt in seinen State. Bewusst kein revalidatePath: das würde
// die Postfach-Seite neu rendern und einen zusätzlichen IMAP-Abruf auslösen.

export async function listSignaturesAction(): Promise<EmailSignature[]> {
  const org = await requireActiveOrg();
  return listSignatures(org.id);
}

export async function createSignatureAction(input: {
  name: string;
}): Promise<EmailSignature[]> {
  const org = await requireActiveOrg();
  const name = input.name.trim();
  if (!name) throw new Error("Bitte einen Namen für die Signatur angeben.");
  return createSignature(org.id, name);
}

export async function saveSignatureAction(input: {
  id: string;
  name?: string;
  html?: string;
}): Promise<EmailSignature[]> {
  const org = await requireActiveOrg();
  const name = input.name?.trim();
  if (input.name !== undefined && !name)
    throw new Error("Der Name der Signatur darf nicht leer sein.");
  return updateSignature(org.id, input.id, { name, html: input.html });
}

export async function deleteSignatureAction(input: {
  id: string;
}): Promise<EmailSignature[]> {
  const org = await requireActiveOrg();
  return deleteSignature(org.id, input.id);
}

export async function setDefaultSignatureAction(input: {
  slot: "new" | "reply";
  id: string | null;
}): Promise<EmailSignature[]> {
  const org = await requireActiveOrg();
  return setDefaultSignature(org.id, input.slot, input.id);
}
