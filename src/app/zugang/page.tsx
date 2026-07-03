import { loginAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ZugangPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string; next?: string }>;
}) {
  const { fehler, next } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="max-w-sm w-full bg-surface border border-line rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-lg bg-brand text-white font-bold text-sm">
            SK
          </div>
          <div>
            <h1 className="text-base font-semibold text-ink">
              SK Kommandozentrale
            </h1>
            <p className="text-xs text-sub">Zugriff geschützt</p>
          </div>
        </div>

        <form action={loginAction} className="space-y-3">
          <input type="hidden" name="next" value={next ?? "/"} />
          <div>
            <label
              htmlFor="password"
              className="block text-[11px] font-medium text-sub mb-1"
            >
              Passwort
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoFocus
              required
              className="w-full h-9 px-2 border border-line rounded-md text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>
          {fehler && (
            <p className="text-xs text-err">
              Falsches Passwort. Bitte erneut versuchen.
            </p>
          )}
          <button
            type="submit"
            className="w-full h-9 bg-brand text-white text-sm font-medium rounded-md hover:bg-sidebar-soft transition"
          >
            Anmelden
          </button>
        </form>
      </div>
    </main>
  );
}
