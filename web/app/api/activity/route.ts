import { NextResponse } from "next/server";
import { findGrant, recentSpends } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What this agent has paid out lately. See `Spend` in `lib/store`. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const tenant = q.get("tenant") ?? "";
  const label = q.get("label") ?? "";
  const safe = /^[a-z0-9][a-z0-9-]*$/;
  if (!safe.test(tenant) || !safe.test(label)) {
    return NextResponse.json({ error: "which agent?" }, { status: 400 });
  }
  try {
    let spends = await recentSpends(tenant, label);

    // Only this Grant's payments. A machine rebuilt under the same name has
    // a new agent key and a new ceiling, and showing what its predecessor
    // spent would attribute one agent's money to another — the same fault
    // the asks list had. The Grant's start is the line.
    const grant = await findGrant(tenant, label);
    if (grant?.start) {
      const since = Number(grant.start) * 1000;
      spends = spends.filter((s) => new Date(s.at).getTime() >= since);
    }

    return NextResponse.json(
      { spends: spends.map((s) => ({ ...s, at: s.at instanceof Date ? s.at.toISOString() : s.at })) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }
}
