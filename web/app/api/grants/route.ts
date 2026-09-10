import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import type { Address, Hex } from "viem";

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
 * registry checks the hash. A wrong copy just fails to name an Agent.
 */

const GRANTS = process.env.GRANT_DIR ?? "/home/opc/hackathon/x402/grants";

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

  mkdirSync(GRANTS, { recursive: true });
  const file = path.join(GRANTS, `${g.tenant}.${g.label}.json`);
  writeFileSync(
    file,
    JSON.stringify({
      label: g.label,
      agentKey: g.agentKey,
      start: g.start,
      end: g.end,
      cap: g.cap,
      registry: g.registry,
      agentId: g.agentId,
    }),
    { mode: 0o600 },
  );

  return NextResponse.json({ ok: true });
}
