import { NextResponse } from "next/server";
import { findGrant } from "@/lib/store";
import { publicClient as client } from "@/lib/rpc";
import { dailyLimit, REGISTRY_ABI } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What an Agent has drawn against its ceiling.
 *
 * Read from the chain rather than from the broker, for two reasons. Spend is
 * settled on chain — the broker only relays — so this is the source rather
 * than a report of it. And the broker identifies an Agent by the address its
 * request came from, which is a container's gateway; the dashboard is not on
 * that network and could not ask on the Agent's behalf even if it wanted to.
 *
 * A stopped machine therefore still answers truthfully, which matters: a
 * ceiling that reads zero because nothing is running would be a lie in the
 * reassuring direction.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const tenant = q.get("tenant") ?? "";
  const label = q.get("label") ?? "";
  const safe = /^[a-z0-9][a-z0-9-]*$/;
  if (!safe.test(tenant) || !safe.test(label)) {
    return NextResponse.json({ error: "which agent?" }, { status: 400 });
  }

  try {
    const g = await findGrant(tenant, label);
    if (!g) return NextResponse.json({ error: "no such agent" }, { status: 404 });

    const allowance = BigInt(g.cap);
    const period = (await client.readContract({
      address: g.registry,
      abi: REGISTRY_ABI,
      functionName: "spentOf",
      args: [g.agentId, dailyLimit(allowance)],
    })) as { start: number; end: number; spend: bigint };

    // A window that has already closed has been spent back to zero: the
    // counter is stale rather than carried forward, which is what makes the
    // allowance per-window rather than for the life of the Grant.
    const now = Math.floor(Date.now() / 1000);
    const open = Number(period.end) > now;
    const spent = open ? period.spend : 0n;

    return NextResponse.json(
      {
        capUsd: Number(allowance) / 1e6,
        spentUsd: Number(spent) / 1e6,
        windowEnds: open ? Number(period.end) : null,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
