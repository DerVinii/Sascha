import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** /zeit ist nur der Einstieg — die eigentliche Stempeluhr liegt unter /zeit/stempel. */
export default function ZeitIndexPage() {
  redirect("/zeit/stempel");
}
