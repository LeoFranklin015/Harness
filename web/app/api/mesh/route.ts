import { NextResponse } from "next/server";
import { keyFilename, loginCommand, mintVisitorKey } from "@/lib/sshkey";
import { canInvite, joinCommands, mintInvite, type Platform } from "@/lib/tailscale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hands out one visit.
 *
 * A visit is two separate permissions, and they are worth keeping separate:
 *
 *   the mesh   a single-use, ephemeral, `tag:visitor` Tailscale key, which puts
 *              the visitor on a network where the only thing they can address
 *              is port 22 on an agent
 *   the door   an ed25519 keypair whose fingerprint the Tenant's own device
 *              writes on chain, which is what sshd asks about when they knock
 *
 * This mints both and returns them once. Only the first is granted here: the
 * second is only a proposal until a Ledger signs `setHost`, and until then the
 * key opens nothing. That asymmetry is the point — a server that can put people
 * on the network still cannot let them in.
 *
 * Nothing is written down. Not to a log, not to disk, not to a cache. A lost
 * invite costs nothing: ask for another, and the one that was lost expires by
 * itself or is overwritten by the next.
 */

export async function GET() {
  return NextResponse.json({ available: canInvite() });
}

export async function POST(request: Request) {
  let machine = "a machine";
  let platform: Platform = "linux";
  let meshAddress: string | null = null;
  let user = "runner";

  try {
    const body = (await request.json()) as {
      machine?: string;
      platform?: Platform;
      meshAddress?: string;
      user?: string;
    };
    if (body.platform === "macos" || body.platform === "windows") platform = body.platform;
    // Whatever ends up here is written into the tailnet's key description and
    // into a shell command, so it is bounded and stripped of anything that is
    // not a name.
    if (typeof body.machine === "string") {
      machine = body.machine.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64) || machine;
    }
    if (typeof body.user === "string") {
      user = body.user.replace(/[^a-z0-9_-]/g, "").slice(0, 32) || user;
    }
    // Only ever an IPv4 literal; it is pasted straight into an ssh command.
    if (typeof body.meshAddress === "string" && /^\d{1,3}(\.\d{1,3}){3}$/.test(body.meshAddress)) {
      meshAddress = body.meshAddress;
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
    // Both halves, or neither. An invite that puts someone on the mesh with no
    // way through the door is a worse outcome than a failed button.
    const [invite, key] = await Promise.all([mintInvite(machine), mintVisitorKey(machine)]);

    return NextResponse.json(
      {
        ...invite,
        commands: joinCommands(invite.key, platform),
        // The fingerprint is what the device is about to sign for. The private
        // key travels with it because the browser is where it has to end up —
        // as a file the visitor saves, not as a wall of base64 they are asked
        // to trust and paste into a shell.
        operator: key.operator,
        fingerprint: key.fingerprint,
        privateKey: key.privateKey,
        keyFilename: keyFilename(machine),
        login: meshAddress ? loginCommand(user, meshAddress, machine) : null,
      },
      // Belt and braces: none of this may sit in a shared cache.
      { headers: { "cache-control": "no-store, private" } },
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
