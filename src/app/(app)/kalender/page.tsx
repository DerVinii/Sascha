import { CalendarDays } from "lucide-react";

export const dynamic = "force-dynamic";

export default function KalenderPage() {
  return (
    <div className="p-4 md:p-6">
      <div className="rounded-xl border border-line bg-surface p-12 text-center">
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-bg text-sub">
          <CalendarDays className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-ink">Kalender</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-sub">
          Termine, Meetings und gebuchte Calls im Überblick — bald an dieser
          Stelle. Hier laufen künftig die Termine aus den Aufgaben und den
          gebuchten Erstgesprächen zusammen.
        </p>
      </div>
    </div>
  );
}
