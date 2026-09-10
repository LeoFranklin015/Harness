import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { asksFor, settle } from "@/lib/pending";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What a tenant's agents are waiting on.
 *
 * Listing is harmless — an ask grants nothing, and the point of showing it is
 * that somebody can decide. Settling only forgets the request; whether it was
 * approved is recorded where it matters, which is whether a Grant now exists.
 */

const label = /^[a-z0-9][a-z0-9-]*$/;

const GRANTS = process.env.GRANT_DIR ?? "/home/opc/hackathon/x402/grants";

/**
 * What approving would need to know, so nobody has to type it.
 *
 * The registry address and today's ceiling are already written down when a
 * machine is provisioned. Making a person copy them off a card and onto a
 * command line is two chances to get it wrong for no benefit.
 */
function machine(tenant: string, agent: string) {
  const file = path.join(GRANTS, `${tenant}.${agent}.json`);
  if (!existsSync(file)) return null;
  try {
    const g = JSON.parse(readFileSync(file, "utf8")) as {
      registry?: string;
      cap?: string;
      start?: number;
      end?: number;
    };
    if (!g.registry) return null;
    return {
      registry: g.registry,
      capUsd: Number(g.cap ?? 0) / 1e6,
      days: Math.max(1, Math.round(((g.end ?? 0) - (g.start ?? 0)) / 86400)),
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const tenant = new URL(request.url).searchParams.get("tenant") ?? "";
  if (!label.test(tenant)) return NextResponse.json({ error: "which machine?" }, { status: 400 });

  try {
    const asks = asksFor(tenant);
    // Every ask names its agent, so the machine's details come free.
    const of = asks[0]?.label;
    return NextResponse.json(
      { asks, machine: of ? machine(tenant, of) : null },
      { headers: { "cache-control": "no-store, private" } },
    );
  } catch {
    // A tenant that never went through the ring has nothing to open, which is
    // an empty list rather than a failure.
    return NextResponse.json({ asks: [] });
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const tenant = url.searchParams.get("tenant") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (!label.test(tenant)) return NextResponse.json({ error: "which machine?" }, { status: 400 });

  return NextResponse.json({ settled: settle(tenant, id) });
}
