import { redirect } from "next/navigation";
import { getActiveOrg } from "@/lib/server/active-org";
import { createOrgAction } from "./actions";

export default async function OnboardingPage() {
  const org = await getActiveOrg();
  if (org) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar text-white font-bold text-lg mb-3">
            SK
          </div>
          <h1 className="text-xl font-semibold text-ink">
            Willkommen in der Kommandozentrale
          </h1>
          <p className="text-sm text-sub mt-1">
            Wie soll deine Organisation heißen?
          </p>
        </div>

        <form
          action={createOrgAction}
          className="bg-surface border border-line rounded-xl p-6 space-y-4"
        >
          <div>
            <label
              htmlFor="name"
              className="block text-xs font-medium text-sub mb-1.5"
            >
              Organisations-Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              autoFocus
              placeholder="SK – Dozent und Coach"
              className="w-full h-10 px-3 border border-line rounded-md text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-sidebar/20 focus:border-sidebar"
            />
            <p className="text-[11px] text-sub mt-1.5">
              Du kannst das später in den Einstellungen ändern. Eine Standard-Pipeline mit 6 Stages wird automatisch angelegt.
            </p>
          </div>

          <button
            type="submit"
            className="w-full h-10 bg-sidebar text-white text-sm font-medium rounded-md hover:bg-sidebar-soft transition"
          >
            Organisation anlegen
          </button>
        </form>
      </div>
    </main>
  );
}
