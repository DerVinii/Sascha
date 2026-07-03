"use client";

import { useState, useTransition } from "react";
import { PlugZap } from "lucide-react";
import {
  testIntegrationAction,
  type IntegrationTestResult,
} from "../actions";

export function IntegrationCard({
  service,
  name,
  description,
  envVar,
  configured,
}: {
  service: "instantly" | "places" | "gemini";
  name: string;
  description: string;
  envVar: string;
  configured: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<IntegrationTestResult | null>(null);

  function runTest() {
    setResult(null);
    startTransition(async () => {
      try {
        setResult(await testIntegrationAction(service));
      } catch {
        setResult({
          ok: false,
          message: "Test fehlgeschlagen. Bitte erneut versuchen.",
        });
      }
    });
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">{name}</h2>
            <span
              className={`pill ${
                configured ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"
              }`}
            >
              {configured ? "Key hinterlegt" : "Nicht konfiguriert"}
            </span>
          </div>
          <p className="text-xs text-sub mt-1">{description}</p>
          <p className="text-[11px] text-sub mt-1.5">
            Umgebungsvariable:{" "}
            <code className="bg-bg px-1 py-0.5 rounded border border-line">
              {envVar}
            </code>
          </p>
        </div>
        <button
          onClick={runTest}
          disabled={pending || !configured}
          className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface text-ink text-sm font-medium hover:bg-bg transition disabled:opacity-50 shrink-0"
        >
          <PlugZap className="h-4 w-4" />
          {pending ? "Teste …" : "Verbindung testen"}
        </button>
      </div>
      {result && (
        <p
          className={`text-xs mt-3 ${result.ok ? "text-ok" : "text-err"}`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
