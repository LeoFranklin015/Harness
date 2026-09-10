"use client";

import { useEffect, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { ConnectLedger } from "@/components/ledger/ConnectLedger";
import { ProvisionDialog, type ProvisionRequest } from "@/components/tenants/ProvisionDialog";
import { TenantSlot, type Tenant } from "@/components/tenants/TenantSlot";
import { connectAndOpenApp } from "@/lib/device-app";
import { RejectedOnDevice, type Device } from "@/lib/ledger";
import { runRelay } from "@/lib/relay-client";
import { loadTenants, remember, remembered, saveTenants, Session, type Authority } from "@/lib/session";
import { agentIdFrom, calldata, firstGrant } from "@/lib/tenant";

/**
 * Two pages, one gate.
 *
 * Nothing is shown until a device has been connected, because there is nothing
 * to show: a Tenant is rooted in a device, and without one there is no
 * authority to display or to spend. Once it has — this tab or an earlier one —
 * the page opens on its machines; the Ledger is asked again only when there is
 * something to sign.
 */
export default function Home() {
  // `undefined` until the browser has had a chance to answer; localStorage is
  // not there during server render and guessing makes the two trees disagree.
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const a = remembered();
    setSession(a ? new Session(a) : null);
  }, []);

  if (session === undefined) return null;
  if (!session) {
    return (
      <ConnectLedger
        onConnected={(dev: Device) => {
          const authority: Authority = { address: dev.address, path: dev.path, model: dev.model };
          remember(authority);
          setSession(new Session(authority, dev));
        }}
      />
    );
  }
  return (
    <Machines
      session={session}
      onForget={async () => {
        await session.release();
        remember(null);
        setSession(null);
      }}
    />
  );
}

/** Two slots, because you have two devices. Add more when you have more. */
const SLOTS = 2;

/** The device app LKRP speaks to. Not Ethereum. */
const RING_APP = "Ledger Sync";

function Machines({ session, onForget }: { session: Session; onForget: () => void }) {
  const { authority } = session;
  const [tenants, setTenants] = useState<(Tenant | null)[]>(() =>
    loadTenants(authority.address, SLOTS),
  );
  const [adding, setAdding] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => saveTenants(authority.address, tenants), [authority.address, tenants]);

  const taken = tenants.filter(Boolean).map((t) => t!.label);

  function setSlot(i: number, next: Tenant | null) {
    setTenants((prev) => prev.map((t, j) => (j === i ? next : t)));
  }
  function patch(i: number, changes: Partial<Tenant>) {
    setTenants((prev) => prev.map((t, j) => (j === i && t ? { ...t, ...changes } : t)));
  }
  function narrate(slot: number, step: string) {
    patch(slot, { step });
  }
  function fail(slot: number, err: unknown, fallback: Tenant | null = null) {
    setSlot(slot, fallback);
    setError(
      err instanceof RejectedOnDevice
        ? "Declined on the device. Nothing was created."
        : (err as Error).message,
    );
  }

  /**
   * Making a machine is two halves with a click between them — and the click
   * is not decoration.
   *
   * First the ring: the Ledger creates (or recognises) its Key Ring and admits
   * this host's broker, one confirmation in Ledger Sync, the browser only
   * forwarding bytes. Everything sealed on the host from here on is recoverable
   * from that device's seed and nothing else.
   *
   * Then the chain: the platform registers the Tenant, and the device signs
   * three transactions in the Ethereum app. Reaching the device again needs
   * `navigator.hid.requestDevice`, and the browser only grants that inside a
   * user gesture — the tail of an async chain does not count, and the request
   * is silently refused. So the flow stops, says what to open on the device,
   * and waits for a click. That click is the gesture.
   */
  async function startProvision(slot: number, req: ProvisionRequest) {
    setAdding(null);
    setError(null);
    setSlot(slot, {
      label: req.label,
      registry: "0x" as Address,
      meshAddress: null,
      agent: req.agent,
      cap: `$${req.capUsd}/day`,
      status: "provisioning",
      step: "Starting",
      request: req,
    });
    const say = (s: string) => narrate(slot, s);

    try {
      say("Ring — preparing this host's identity");
      const created = await fetch("/api/enrolments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenant: req.label }),
      });
      const enrolment = await created.json();
      if (!created.ok) throw new Error(enrolment.error ?? "could not start enrolment");

      await session.release();
      await connectAndOpenApp(RING_APP, say);
      const ring = await shareRing(enrolment.id, say);

      patch(slot, {
        awaiting: true,
        step:
          (ring.outcome === "created" ? "Ring created. " : "Ring recognised. ") +
          "Open Ethereum on your device, then continue.",
      });
    } catch (err) {
      fail(slot, err);
    }
  }

  /** The second half. Runs from a click, which is what lets it reach the device. */
  async function continueProvision(tenant: Tenant) {
    const slot = tenants.findIndex((t) => t?.label === tenant.label);
    const req = tenant.request;
    if (!req) return;
    setError(null);
    patch(slot, { awaiting: false });
    const say = (s: string) => narrate(slot, s);

    try {
      const dev = await session.device(say);

      const res = await fetch("/api/provision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...req, device: dev.address }),
      });
      if (!res.ok || !res.body) throw new Error(`provisioning failed: ${res.status}`);

      let executor: Address | null = null;
      let ready: {
        registry: Address;
        meshAddress: string;
        hostKey: Hex;
        operator: Hex;
        agentKey: Address;
        ipv4: Hex;
      } | null = null;

      for await (const ev of ndjson(res.body)) {
        if (ev.error) throw new Error(ev.error);
        if (ev.executor) executor = ev.executor;
        if (ev.ready) ready = ev.ready;
        patch(slot, {
          ...(ev.registry && { registry: ev.registry }),
          ...(ev.meshAddress && { meshAddress: ev.meshAddress }),
          ...(ev.step && { step: ev.step }),
        });
      }
      if (!ready || !executor) throw new Error("the platform stopped before handing over");

      say("Ledger 1 of 3 — point the tenant at its executor");
      await dev.send({ to: ready.registry, data: calldata.setExecutor(executor) }, say);

      say("Ledger 2 of 3 — publish where the machine is");
      await dev.send(
        { to: ready.registry, data: calldata.setHost(ready.ipv4, ready.hostKey, ready.operator) },
        say,
      );

      say("Ledger 3 of 3 — set the ceiling");
      const grant = firstGrant({
        label: req.agent,
        agentKey: ready.agentKey,
        capUsd: Number(req.capUsd),
        days: Number(req.days),
      });
      const receipt = await dev.send({ to: ready.registry, data: calldata.grant(grant) }, say);
      const agentId = agentIdFrom(receipt.logs);
      if (!agentId) throw new Error("granted, but the receipt named no agent");

      // The chain keeps only the hash, so the terms are filed here too —
      // otherwise nothing could ever act under this Grant again.
      await fetch("/api/grants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenant: req.label,
          label: req.agent,
          agentKey: ready.agentKey,
          start: grant.start,
          end: grant.end,
          cap: grant.spends[0]!.allowance.toString(),
          registry: ready.registry,
          agentId,
        }),
      });

      setSlot(slot, {
        label: req.label,
        registry: ready.registry,
        meshAddress: ready.meshAddress,
        agent: req.agent,
        agentId,
        cap: `$${req.capUsd}/day`,
        status: "live",
      });
    } catch (err) {
      // The ring is done and cannot be undone; keep the slot so they can retry
      // the chain half rather than making a second ring for the same name.
      fail(slot, err, {
        ...tenant,
        awaiting: true,
        step: "Stopped. Open Ethereum on your device, then continue.",
      });
    }
  }

  /** One signature on the device. Everything that answers to it stops. */
  async function revoke(tenant: Tenant) {
    const i = tenants.findIndex((t) => t?.label === tenant.label);
    if (!tenant.agentId) return;
    setError(null);
    setSlot(i, { ...tenant, status: "provisioning", step: "Ledger — revoke the agent" });
    try {
      const dev = await session.device((s) => narrate(i, s));
      await dev.send({ to: tenant.registry, data: calldata.revoke(tenant.agentId) }, (s) => narrate(i, s));
      setSlot(i, { ...tenant, status: "revoked" });
    } catch (err) {
      fail(i, err, { ...tenant, status: "live" });
    }
  }

  return (
    <div className="min-h-dvh px-8 py-14 lg:px-20">
      <header className="mb-12 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
            <span className="h-px w-8 bg-neutral-700" />
            Harness
          </div>
          <h1 className="text-2xl font-medium tracking-tight text-neutral-50">Your machines</h1>
        </div>

        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-neutral-600">Authority</p>
          <CopyAddress address={authority.address} />
          <p className="text-xs text-neutral-600">
            {authority.model} · {authority.path} ·{" "}
            <button onClick={onForget} className="underline decoration-neutral-800 underline-offset-2 hover:text-neutral-400">
              switch device
            </button>
          </p>
        </div>
      </header>

      {error && (
        <p className="mb-5 rounded-lg border border-amber-900/50 bg-amber-950/30 px-4 py-2.5 text-sm text-amber-300/90" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {tenants.map((tenant, i) => (
          <TenantSlot
            key={i}
            tenant={tenant}
            onAdd={() => setAdding(i)}
            onContinue={continueProvision}
            onRevoke={revoke}
          />
        ))}
      </div>

      <ProvisionDialog
        open={adding !== null}
        taken={taken}
        onClose={() => setAdding(null)}
        onSubmit={(req) => startProvision(adding!, req)}
      />
    </div>
  );
}

/**
 * The address, whole, one click away.
 *
 * Shown short because it is a label, copied long because it is an address —
 * the thing most often done with it is pasting it into a faucet or a block
 * explorer. The clipboard API is only there on secure origins, so there is a
 * fallback for a page served over plain HTTP.
 */
function CopyAddress({ address }: { address: Address }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function copy() {
    await copyText(address);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      onClick={copy}
      title={address}
      className="group inline-flex items-center gap-2 font-mono text-sm text-neutral-300 transition hover:text-neutral-50"
    >
      {address.slice(0, 10)}…{address.slice(-8)}
      <span className={`text-[10px] uppercase tracking-wider ${copied ? "text-emerald-400" : "text-neutral-600 group-hover:text-neutral-400"}`}>
        {copied ? "copied" : "copy"}
      </span>
    </button>
  );
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {}
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

/**
 * The ring, through the relay.
 *
 * The host runs the LKRP flow and needs the device for it; the browser is the
 * only thing plugged into the device, so it forwards APDUs and nothing more. The
 * server hands back a relay id first, the browser starts forwarding, and the
 * outcome arrives on the same stream when the device has confirmed.
 */
async function shareRing(enrolmentId: string, say: (s: string) => void) {
  const controller = new AbortController();
  say("Confirm on your device");

  const res = await fetch(`/api/enrolments/${enrolmentId}/ring`, { method: "POST" });
  if (!res.body) throw new Error("no response from the host");

  let relaying: Promise<void> | null = null;
  let result: { outcome: string; rootId?: string; members?: number } | null = null;
  try {
    for await (const msg of ndjson(res.body)) {
      if (msg.relayId) {
        relaying = runRelay(msg.relayId, controller.signal);
        continue;
      }
      if (msg.ok === false) throw new Error(msg.error);
      result = msg;
    }
  } finally {
    controller.abort();
    await relaying?.catch(() => {});
  }
  if (!result) throw new Error("the ring flow ended without a result");
  return result;
}

/** NDJSON: one event per line, a partial line held over to the next chunk. */
async function* ndjson(body: ReadableStream<Uint8Array>): AsyncGenerator<any> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) yield JSON.parse(line);
  }
  if (buffer.trim()) yield JSON.parse(buffer);
}
