import { NextResponse } from "next/server";
import { claimNext } from "@/lib/signing";
import { BOX, forwardToBox } from "@/lib/box";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * What the device holder should sign next, if anything.
 *
 * Long-polled: the machine with the Ledger asks and the request is held open
 * until there is work or the window closes. Outbound only, so it works from
 * anywhere that can see this — no forwarded port, no firewall hole, nothing
 * for a person to be talked through.
 */

const POLL_MS = 25_000;
const label = /^[a-z0-9][a-z0-9-]*$/;

export async function GET(request: Request) {
  // Shares state with the box; the whole exchange happens there.
  if (BOX) return forwardToBox(request);

  const tenant = new URL(request.url).searchParams.get("tenant") ?? "";
  if (!label.test(tenant)) return NextResponse.json({ error: "which machine?" }, { status: 400 });

  const job = await claimNext(tenant, POLL_MS);
  return NextResponse.json(job ? { job } : {}, {
    headers: { "cache-control": "no-store, private" },
  });
}
