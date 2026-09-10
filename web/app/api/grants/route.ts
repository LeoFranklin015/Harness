import { NextResponse } from "next/server";
import type { Address, Hex } from "viem";
import { saveGrant } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Keeps a copy of what the device just signed.
 *
 * A Grant lives on chain only as a hash, so nobody can read the terms back out
 * of it — anyone acting under one has to resupply the struct byte for byte,
 * timestamps included. The device is the only thing that can create one, and
 * the browser is the only place the full struct exists at that moment, so it
 * is filed here on the way past.
 *
 * This is a record, not an authority: editing it grants nothing, because the
 * registry checks the hash. A wrong copy just fails to name an Agent. It went
 * to the metadata store rather than a file in the repo because a record that
 * grants nothing is still a list of every Agent, its key and its ceiling.
 */
export async function POST(request: Request) {
  const g = (await request.json()) as {
    tenant: string;
    label: string;
    agentKey: Address;
    start: number;
    end: number;
    cap: string;
    registry: Address;
    agentId: Hex;
  };

  const safe = /^[a-z0-9][a-z0-9-]*$/;
  if (!safe.test(g.tenant ?? "") || !safe.test(g.label ?? "")) {
    return NextResponse.json({ error: "bad tenant or label" }, { status: 400 });
  }

  try {
    await saveGrant({
      tenant: g.tenant,
      label: g.label,
      agentKey: g.agentKey,
      start: g.start,
      end: g.end,
      cap: g.cap,
      registry: g.registry,
      agentId: g.agentId,
    });
  } catch (err) {
    // Losing this copy is not fatal to the transaction that just happened —
    // the Grant is on chain — but the Agent cannot act without it, so it is
    // not something to swallow either.
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
