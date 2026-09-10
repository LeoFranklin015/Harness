"use client";

import { useEffect, useState } from "react";
import type { Enrolment } from "@/lib/enrolment";
import { connectAndOpenApp, isSupported, type ConnectedDevice } from "@/lib/device-app";
import { runRelay } from "@/lib/relay-client";

/** The device app LKRP speaks to. */
const REQUIRED_APP = "Ledger Sync";

export default function Onboarding() {
  const [tenant, setTenant] = useState("acme");
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [device, setDevice] = useState<ConnectedDevice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [webhid, setWebhid] = useState(true);

  useEffect(() => setWebhid(isSupported()), []);

  async function run<T>(job: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try {
      return await job();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep(null);
    } finally {
      setBusy(false);
    }
  }

  const begin = () =>
    run(async () => {
      const res = await fetch("/api/enrolments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenant }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "could not start");
      setEnrolment(body);
    });

  // Step 1. Must run from a click: the WebHID picker will not appear otherwise.
  const connect = () =>
    run(async () => {
      setDevice(await connectAndOpenApp(REQUIRED_APP, setStep));
      setStep(null);
    });

  // Step 3. The host runs the whole flow; the browser only forwards APDUs to
  // the device, which is the one thing it cannot do from there.
  const shareRing = () =>
    run(async () => {
      if (!enrolment) return;
      const controller = new AbortController();
      setStep("Confirm on your device");

      const res = await fetch(`/api/enrolments/${enrolment.id}/ring`, { method: "POST" });
      if (!res.body) throw new Error("no response from the host");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let relaying: Promise<void> | null = null;

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let nl: number;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            if (!line.trim()) continue;
            const msg = JSON.parse(line);

            if (msg.relayId) {
              // Start forwarding as soon as the host has a session open.
              relaying = runRelay(msg.relayId, controller.signal);
              continue;
            }
            if (msg.ok === false) throw new Error(msg.error);
            setOutcome(msg.outcome);
            setEnrolment(msg);
          }
        }
      } finally {
        controller.abort();
        await relaying?.catch(() => {});
        setStep(null);
      }
    });

  const done = enrolment?.status === "enrolled";

  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <header className="mb-12">
        <h1 className="text-2xl font-medium tracking-tight">Set up your agent host</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-400">
          Your agents run on our hosts and decrypt their own secrets there. The device stays on
          your desk, and no secret ever crosses the wire — only public keys.
        </p>
      </header>

      {!enrolment ? (
        <section className="space-y-4">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-neutral-500">Tenant name</span>
            <input
              value={tenant}
              onChange={(e) => setTenant(e.target.value)}
              className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-sm outline-none focus:border-neutral-600"
              placeholder="acme"
            />
            <span className="mt-1 block text-xs text-neutral-600">
              Becomes <span className="font-mono">{tenant || "…"}.platform.eth</span>
            </span>
          </label>
          <button onClick={begin} disabled={busy || !tenant} className={primary}>
            {busy ? "Starting…" : "Begin"}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </section>
      ) : (
        <section className="space-y-8">
          <Step n={1} title="Connect your Ledger" done={!!device}>
            {device ? (
              <p className="text-sm text-neutral-400">
                <span className="text-neutral-200">{device.name}</span> connected, running{" "}
                {REQUIRED_APP}.
              </p>
            ) : (
              <>
                <p className="text-sm leading-relaxed text-neutral-400">
                  Plug in your Ledger and unlock it. We&rsquo;ll open {REQUIRED_APP} for you.
                </p>
                {webhid ? (
                  <button onClick={connect} disabled={busy} className={primary}>
                    {busy ? "Working…" : "Connect"}
                  </button>
                ) : (
                  <p className={warn}>
                    This browser has no WebHID. Use Chrome, Edge or Brave.
                  </p>
                )}
              </>
            )}
          </Step>

          <Step n={2} title="Prepare your agent host" done={!!device} muted={!device}>
            {device ? (
              <p className="text-sm leading-relaxed text-neutral-400">
                Ready. Its identity is{" "}
                <span className="font-mono text-xs text-neutral-300">
                  {enrolment.memberPubkey.slice(0, 24)}…
                </span>{" "}
                — a public key. Its private half never leaves the host, and this is the only part
                your device will see.
              </p>
            ) : (
              <p className="text-sm text-neutral-500">Waiting for your device.</p>
            )}
          </Step>

          <Step n={3} title="Share your ring with it" done={done} muted={!device}>
            {done ? (
              <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-4">
                <p className="text-sm font-medium text-emerald-300">
                  {outcome === "created"
                    ? "New ring created on your device"
                    : outcome
                      ? `Existing ring ${outcome} from your device`
                      : "Ring shared with your agent host"}
                </p>
                <dl className="mt-3 space-y-1 font-mono text-xs text-neutral-400">
                  <Row k="root" v={enrolment.rootId!} />
                  <Row k="path" v={enrolment.applicationPath!} />
                </dl>
                <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                  Your host can now decrypt its agents&rsquo; keys with no device attached. Removing
                  a member later rotates the ring and invalidates everything encrypted before it;
                  adding one does not.
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm leading-relaxed text-neutral-400">
                  Your device creates the ring — or recognises the one it already has — and admits
                  the host above. One confirmation.
                </p>
                <button onClick={shareRing} disabled={busy || !device} className={primary}>
                  {busy ? "Working…" : "Share ring"}
                </button>
              </>
            )}
          </Step>

          {step && (
            <p className="flex items-center gap-2 text-xs text-neutral-400">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              {step}
            </p>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </section>
      )}
    </main>
  );
}

const primary =
  "rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 disabled:opacity-40";
const warn =
  "rounded-md border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-xs text-amber-300";

function Step({ n, title, done, muted, children }: {
  n: number; title: string; done?: boolean; muted?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={`flex gap-4 ${muted && !done ? "opacity-50" : ""}`}>
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${
          done ? "border-emerald-800 bg-emerald-950 text-emerald-400" : "border-neutral-800 text-neutral-500"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <h2 className="text-sm font-medium">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-10 shrink-0 text-neutral-600">{k}</dt>
      <dd className="truncate">{v}</dd>
    </div>
  );
}
