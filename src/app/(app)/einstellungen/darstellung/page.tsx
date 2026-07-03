import { cookies } from "next/headers";
import { ThemePicker } from "../_components/theme-picker";
import type { Theme } from "../actions";

export const dynamic = "force-dynamic";

export default async function DarstellungPage() {
  const store = await cookies();
  const raw = store.get("sk_theme")?.value;
  const theme: Theme =
    raw === "dark" || raw === "system" ? raw : "light";

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink mb-1">Erscheinungsbild</h2>
      <p className="text-xs text-sub mb-4">
        Gilt für dieses Gerät — „System" folgt der Einstellung des
        Betriebssystems.
      </p>
      <ThemePicker current={theme} />
    </div>
  );
}
