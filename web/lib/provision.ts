"use client";

import type { Address, Hex } from "viem";
import { connectAndOpenApp } from "@/lib/device-app";
import { runRelay } from "@/lib/relay-client";
import type { Session } from "@/lib/session";
import { ACTIONS, PROTOCOLS, type CustomRule } from "@/lib/capabilities";
import { agentIdFrom, allowanceFor, calldata, firstGrant, USDC } from "@/lib/tenant";
import type { ProvisionRequest } from "@/components/tenants/ProvisionDialog";

/**
 * Making a machine, in the two halves it has to be made in.
 *
 * This used to live inside the dashboard page, which was fine while the
 * dashboard was the only thing that made machines. The wizard makes them too
 * now, and two copies of a flow that reaches a hardware wallet is exactly the
 * kind of duplication that ends with one of them quietly wrong. Moved
 * unchanged rather than rewritten, for the same reason.
 *
 * The split is not organisational. The ring half ends by *stopping*: reaching
 * the device again needs `navigator.hid.requestDevice`, and a browser only
 * grants that inside a user gesture. The tail of an async chain is not one,
 * and the request is refused silently. So the flow halts, says what to open,
 * and waits for a click — and that click is the gesture that buys the second
 * half.
 */

export type Say = (s: string) => void;

export const RING_APP = "Ledger Sync";

/** NDJSON: one event per line, a partial line held over to the next chunk. */
export async function* ndjson(body: ReadableStream<Uint8Array>): AsyncGenerator<any> {
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

/**
 * The ring, through the relay.
 *
 * The host runs the LKRP flow and needs the device for it; the browser is the
 * only thing plugged into the device, so it forwards APDUs and nothing more.
 * The server hands back a relay id first, the browser starts forwarding, and
 * the outcome arrives on the same stream once the device has confirmed.
 */
async function shareRing(enrolmentId: string, say: Say) {
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

/**
 * First half: the Ledger creates or recognises its Key Ring and admits this
 * host's broker. One confirmation in Ledger Sync, the browser only forwarding
 * bytes. Everything sealed on the host from here is recoverable from that
 * device's seed and nothing else.
 */
export async function startRing(
  session: Session,
  req: ProvisionRequest,
  say: Say,
): Promise<{ outcome: string }> {
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
  return shareRing(enrolment.id, say);
}

/** What the chain half produced, for whoever has to record it. */
export type Provisioned = {
  registry: Address;
  meshAddress: string;
  agentKey: Address;
  agentId: Hex;
  capUsd: number;
};

/**
 * The call rules a request asks for, resolved to (target, selector) pairs.
 *
 * A machine with nothing chosen still gets USDC transfers: an Agent that can
 * call nothing is not a machine, it is a name.
 */
export function rulesFor(req: ProvisionRequest): { target: Address; selector: Hex }[] {
  // Every chosen action, on every chosen token.
  const pairs = (req.tokens ?? []).flatMap((token) =>
    (req.actions ?? [])
      .map((id) => ACTIONS.find((a) => a.id === id))
      .filter((a): a is NonNullable<typeof a> => !!a)
      .map((a) => ({ target: token as Address, selector: a.selector })),
  );

  const protocols = (req.protocols ?? [])
    .map((id) => PROTOCOLS.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({ target: p.target, selector: p.selector }));

  const custom = (req.customRules ?? []).map((r: CustomRule) => ({
    target: r.target as Address,
    selector: r.selector as Hex,
  }));

  const all = [...pairs, ...protocols, ...custom];
  return all.length ? all : [{ target: USDC, selector: "0xa9059cbb" as Hex }];
}

/**
 * Second half. Must be called from a click, which is what lets it reach the
 * device at all.
 */
export async function finishOnChain(opts: {
  session: Session;
  req: ProvisionRequest;
  /** Whether the account is 7702-upgraded: four signatures, or one. */
  upgraded: boolean | null;
  say: Say;
  /** Progress worth showing before the end — the registry, the address. */
  onPartial?: (p: { registry?: Address; meshAddress?: string }) => void;
}): Promise<Provisioned> {
  const { session, req, upgraded, say, onPartial } = opts;
  const dev = await session.device(say);

  const res = await fetch("/api/provision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...req, device: dev.address }),
  });
  if (!res.ok || !res.body) {
    // The route answers with a plain-text reason. Throwing only the status
    // turned "bad label" into "provisioning failed: 400", which tells the
    // person nothing they can act on.
    const why = await res.text().catch(() => "");
    throw new Error(why.trim() ? `the platform refused: ${why.trim()}` : `provisioning failed: ${res.status}`);
  }

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
    if (ev.step) say(ev.step);
    if (ev.registry || ev.meshAddress) {
      onPartial?.({ registry: ev.registry, meshAddress: ev.meshAddress });
    }
  }
  if (!ready || !executor) throw new Error("the platform stopped before handing over");

  const grant = firstGrant({
    label: req.agent,
    agentKey: ready.agentKey,
    capUsd: Number(req.capUsd),
    days: Number(req.days),
    rules: rulesFor(req),
  });

  // The four things that make a machine real. Point it at its executor;
  // publish where it is and who may reach it; allow the executor to draw on
  // the Tenant's USDC (funding is a pull, so the token has to be told, and it
  // is bounded by what the Grant could spend over its whole life); then set
  // the ceiling, which is what mints the Agent's name.
  const steps = [
    { say: "point the tenant at its executor", to: ready.registry, data: calldata.setExecutor(executor) },
    {
      say: "publish where the machine is",
      to: ready.registry,
      data: calldata.setHost(ready.ipv4, ready.hostKey, ready.operator),
    },
    {
      say: "let the executor draw on your USDC",
      to: USDC,
      data: calldata.approve(executor, allowanceFor(Number(req.capUsd), Number(req.days))),
    },
    { say: "set the ceiling", to: ready.registry, data: calldata.grant(grant) },
  ];

  // An upgraded account does all four in one transaction, so it is one
  // approval. Every call inside it is still made by the Tenant, so the
  // contracts see exactly what they would have seen one at a time.
  let receipt;
  if (upgraded) {
    say("Ledger — one signature for all four steps");
    receipt = await dev.sendBatch(steps.map(({ to, data }) => ({ to, data })), say);
  } else {
    for (const [i, s] of steps.entries()) {
      say(`Ledger ${i + 1} of ${steps.length} — ${s.say}`);
      receipt = await dev.send({ to: s.to, data: s.data }, say);
    }
  }
  if (!receipt) throw new Error("nothing was signed");
  const agentId = agentIdFrom(receipt.logs);
  if (!agentId) throw new Error("granted, but the receipt named no agent");

  // The chain keeps only the hash, so the terms are filed too — otherwise
  // nothing could ever act under this Grant again.
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

  return {
    registry: ready.registry,
    meshAddress: ready.meshAddress,
    agentKey: ready.agentKey,
    agentId,
    capUsd: Number(req.capUsd),
  };
}
