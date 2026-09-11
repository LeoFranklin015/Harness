"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * The passcode, and nothing else.
 *
 * This is not the product's authority — the Ledger is, and it is asked for
 * again on the other side. This only decides who may reach a page that can
 * provision and revoke, on a box whose port is open.
 */
export default function Login() {
  return (
    <Suspense fallback={null}>
      <Form />
    </Suspense>
  );
}

function Form() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (!res.ok) {
        const out = await res.json().catch(() => ({}));
        throw new Error(out.error ?? "Wrong passcode.");
      }
      // Replace, not push: the login page should not be a step someone can
      // go back to once they are through it.
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-xs">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
          <span className="h-px w-8 bg-neutral-700" />
          Harness
        </div>
        <h1 className="text-xl font-medium tracking-tight text-neutral-50">Passcode</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">
          This dashboard can create and revoke machines. Your Ledger is asked
          for separately.
        </p>

        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          autoFocus
          autoComplete="current-password"
          className="mt-5 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-700 focus:border-neutral-600"
          placeholder="••••••••"
        />

        <button
          type="submit"
          disabled={busy || !passcode}
          className="mt-3 w-full rounded-lg border border-neutral-800 bg-neutral-900 py-2 text-sm text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-800 disabled:opacity-40"
        >
          {busy ? "Checking…" : "Enter"}
        </button>

        {error && (
          <p className="mt-3 text-sm text-amber-400/90" role="alert">
            {error}
          </p>
        )}
      </form>
    </main>
  );
}
