import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Solange kein Outlook-Postfach verbunden ist, ist die Unibox die Startansicht.
export default function PostfachPage() {
  redirect("/postfach/unibox");
}
