import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * /zeit ist nur der Einstieg — die Stempeluhr liegt unter /zeit/stempel.
 *
 * Die Einrichtung eines Handys läuft nicht über diese Seite, sondern über den
 * persönlichen Einladungslink (/zeit/einladung/[token]), den Sascha verschickt.
 */
export default function ZeitIndexPage() {
  redirect("/zeit/stempel");
}
