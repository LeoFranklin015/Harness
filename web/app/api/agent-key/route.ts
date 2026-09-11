import { NextResponse } from "next/server";
import { agentKeyFor } from "@/lib/agent-root";
import { BOX, forwardToBox } from "@/lib/box";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The address of an Agent's key, and only the address.
 *
 * Re-issuing a Grant needs to name the key it is for, and that key is derived
 * from the tenant's sealed root rather than stored anywhere — so the dashboard
 * cannot know it without asking. The private half never leaves this process;
 * what goes back is what is already public on chain.
 */

const label = /^[a-z0-9][a-z0-9-]*$/;

export async function POST(request: Request) {
  // Only the box can do this; everywhere else forwards to it.
  if (BOX) return forwardToBox(request);

  const { label: tenant, agent } = (await request.json().catch(() => ({}))) as {
    label?: string;
    agent?: string;
  };

  if (!label.test(tenant ?? "") || !label.test(agent ?? "")) {
    return NextResponse.json({ error: "bad tenant or agent" }, { status: 400 });
  }

  try {
    return NextResponse.json({ agentKey: agentKeyFor(tenant!, agent!).address });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
