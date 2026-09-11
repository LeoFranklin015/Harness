import { NextResponse } from "next/server";
import { asksFor, settle } from "@/lib/pending";
import { findGrant } from "@/lib/store";
import { BOX, forwardToBox } from "@/lib/box";

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

/** How long an unanswered ask stays worth showing. */
const STALE_MS = 24 * 60 * 60 * 1000;

/**
 * What approving would need to know, so nobody has to type it.
 *
 * The registry address and today's ceiling are already written down when a
 * machine is provisioned. Making a person copy them off a card and onto a
 * command line is two chances to get it wrong for no benefit.
 */
async function machine(tenant: string, agent: string) {
  try {
    const g = await findGrant(tenant, agent);
    if (!g?.registry) return null;
    return {
      registry: g.registry,
      capUsd: Number(g.cap ?? 0) / 1e6,
      days: Math.max(1, Math.round(((g.end ?? 0) - (g.start ?? 0)) / 86400)),
      /** When this Grant began. Asks older than it are another Grant's. */
      since: Number(g.start ?? 0),
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  // Asks are sealed files on the box's disk.
  if (BOX) return forwardToBox(request);

  const tenant = new URL(request.url).searchParams.get("tenant") ?? "";
  if (!label.test(tenant)) return NextResponse.json({ error: "which machine?" }, { status: 400 });

  const agent = new URL(request.url).searchParams.get("agent") ?? "";

  try {
    let asks = asksFor(tenant);

    // One agent's asks, not the whole machine's. Two agents under one tenant
    // were showing each other's requests.
    if (agent) asks = asks.filter((a) => a.label === agent);

    const of = agent || asks[0]?.label;
    const details = of ? await machine(tenant, of) : null;

    // Anything asked before the current Grant was signed belongs to a
    // different Grant — a different agent key, very often a machine since
    // rebuilt under the same name. Approving one would raise a ceiling
    // nobody asked about.
    if (details?.since) asks = asks.filter((a) => a.asked >= details.since * 1000);

    // And an ask nobody answered for a day is not waiting, it is litter.
    // The agent was told not to retry and has long since moved on.
    const cutoff = Date.now() - STALE_MS;
    asks = asks.filter((a) => a.asked >= cutoff);

    return NextResponse.json(
      { asks, machine: details },
      { headers: { "cache-control": "no-store, private" } },
    );
  } catch {
    // A tenant that never went through the ring has nothing to open, which is
    // an empty list rather than a failure.
    return NextResponse.json({ asks: [] });
  }
}

export async function DELETE(request: Request) {
  // Asks are sealed files on the box's disk.
  if (BOX) return forwardToBox(request);

  const url = new URL(request.url);
  const tenant = url.searchParams.get("tenant") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (!label.test(tenant)) return NextResponse.json({ error: "which machine?" }, { status: 400 });

  return NextResponse.json({ settled: settle(tenant, id) });
}
