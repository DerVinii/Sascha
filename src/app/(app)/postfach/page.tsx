import { Inbox } from "lucide-react";

export const dynamic = "force-dynamic";

export default function PostfachPage() {
  return (
    <div className="p-4 md:p-6">
      <div className="rounded-xl border border-line bg-surface p-12 text-center">
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-bg text-sub">
          <Inbox className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-ink">Postfach</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-sub">
          Antworten aus dem Cold-Outreach zentral beantworten — bald an dieser
          Stelle. Hier landen künftig die eingehenden Antworten aus den
          Instantly-Kampagnen zur direkten Bearbeitung.
        </p>
      </div>
    </div>
  );
}
