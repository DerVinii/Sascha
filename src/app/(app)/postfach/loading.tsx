import { Loader2 } from "lucide-react";

/**
 * Sofortiges Lade-Feedback beim Klick auf den Postfach-Reiter, während die
 * Server-Component live vom Mail-Server lädt (gilt auch für Unibox/Accounts).
 */
export default function PostfachLoading() {
  return (
    <div className="p-4 md:p-6 h-full">
      <div className="h-full flex items-center justify-center rounded-xl border border-line bg-surface">
        <div className="text-center text-sub text-sm">
          <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
          Postfach wird geladen …
        </div>
      </div>
    </div>
  );
}
