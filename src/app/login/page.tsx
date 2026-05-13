"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setSending(false);
    if (error) {
      setError(error.message);
    } else {
      setMessage(
        "Wir haben dir einen Login-Link an deine E-Mail geschickt. Prüfe dein Postfach.",
      );
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar text-white font-bold text-lg mb-3">
            SK
          </div>
          <h1 className="text-xl font-semibold text-ink">SK Kommandozentrale</h1>
          <p className="text-sm text-sub mt-1">Anmelden</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-surface border border-line rounded-xl p-6 space-y-4"
        >
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium text-sub mb-1.5"
            >
              E-Mail-Adresse
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@beispiel.de"
              className="w-full h-10 px-3 border border-line rounded-md text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-sidebar/20 focus:border-sidebar"
              autoComplete="email"
              disabled={sending}
            />
          </div>

          <button
            type="submit"
            disabled={sending}
            className="w-full h-10 bg-sidebar text-white text-sm font-medium rounded-md hover:bg-sidebar-soft transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? "Wird gesendet …" : "Login-Link senden"}
          </button>

          {message && (
            <div className="text-xs text-ok bg-ok/10 border border-ok/20 rounded-md p-3">
              {message}
            </div>
          )}
          {error && (
            <div className="text-xs text-err bg-err/10 border border-err/20 rounded-md p-3">
              {error}
            </div>
          )}
        </form>

        <p className="text-[11px] text-sub text-center mt-6">
          Magic-Link-Anmeldung — kein Passwort nötig
        </p>
      </div>
    </main>
  );
}
