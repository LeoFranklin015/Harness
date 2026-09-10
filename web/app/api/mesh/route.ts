import { NextResponse } from "next/server";
import { canInvite, joinCommands, mintInvite } from "@/lib/tailscale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hands out one way onto the mesh.
 *
 * A GET says whether this host can invite at all, so the button can be absent
 * rather than broken when no OAuth client is configured.
 *
 * A POST mints a single-use, ephemeral, short-lived, `tag:visitor` key. The key
 * is returned once and never written down — not to a log, not to disk. If the
 * visitor loses it they ask for another, which costs nothing, and the one they
 * lost expires on its own.
 */

export async function GET() {
  return NextResponse.json({ available: canInvite() });
}

export async function POST(request: Request) {
  let machine = "a machine";
  try {
    const body = (await request.json()) as { machine?: string };
    // Whatever ends up here is written into the tailnet's key description, so
    // it is bounded and stripped of anything that is not a name.
    if (typeof body.machine === "string") {
      machine = body.machine.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64) || machine;
    }
  } catch {
    // No body is fine; the description just stays generic.
  }

  if (!canInvite()) {
    return NextResponse.json(
      { error: "This host has no Tailscale OAuth client, so it cannot issue invites." },
      { status: 501 },
    );
  }

  try {
    const invite = await mintInvite(machine);
    return NextResponse.json(
      { ...invite, commands: joinCommands(invite.key) },
      // Belt and braces: a key must never sit in a shared cache.
      { headers: { "cache-control": "no-store, private" } },
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
