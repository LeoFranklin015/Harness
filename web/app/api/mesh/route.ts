import { NextResponse } from "next/server";
import { setupCommand, setupScript, sshCommand, visitorKeyFor } from "@/lib/sshkey";
import { stash } from "@/lib/handoff";
import { canInvite, installCommand, mintInvite, type Platform } from "@/lib/tailscale";
import { BOX, forwardToBox } from "@/lib/box";

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
  // The visitor key derives from the sealed root, which only the box has.
  if (BOX) return forwardToBox(request);

  let machine = "a machine";
  let platform: Platform = "linux";
  let meshAddress: string | null = null;
  let ensName: string | null = null;
  let agent = "runner";
  let user = "runner";

  try {
    const body = (await request.json()) as {
      machine?: string;
      platform?: Platform;
      meshAddress?: string;
      ensName?: string;
      agent?: string;
      user?: string;
    };
    if (body.platform === "macos" || body.platform === "windows") platform = body.platform;
    // Whatever ends up here is written into the tailnet's key description and
    // into a shell command, so it is bounded and stripped of anything that is
    // not a name.
    if (typeof body.machine === "string") {
      machine = body.machine.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64) || machine;
    }
    // Names a derivation path, so it is held to the same shape as a label.
    if (typeof body.agent === "string") {
      agent = body.agent.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64) || agent;
    }
    if (typeof body.user === "string") {
      user = body.user.replace(/[^a-z0-9_-]/g, "").slice(0, 32) || user;
    }
    // Only ever an IPv4 literal; it is pasted straight into an ssh command.
    if (typeof body.meshAddress === "string" && /^\d{1,3}(\.\d{1,3}){3}$/.test(body.meshAddress)) {
      meshAddress = body.meshAddress;
    }
    // Also pasted into a shell, so it is held to the shape of a name.
    if (typeof body.ensName === "string" && /^[a-z0-9.-]{1,128}$/.test(body.ensName)) {
      ensName = body.ensName;
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
    // The key is derived from the Tenant's sealed root, so it is the same key
    // the chain was told about at provisioning — which is why an invite costs
    // no transaction. The mesh key is the only thing minted here.
    const key = visitorKeyFor(machine, agent);
    const invite = await mintInvite(machine);

    // What the visitor is reachable at. The name once the tailnet resolves
    // `.eth`, the raw address otherwise — the name is better, because it is
    // the same string the chain answers for and it stops resolving the moment
    // the Agent is revoked.
    const host = ensName ?? meshAddress;

    // Where this page is being served from, as the browser reached it, so the
    // command works from wherever the visitor is sitting rather than from a
    // hostname this process guessed about itself.
    const proto = request.headers.get("x-forwarded-proto") ?? "http";
    // `x-forwarded-host` when this is the box answering for a deployed
    // instance: the link has to name the address the visitor can actually
    // reach, not the one this process happens to listen on.
    const seen =
      request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
    const origin = `${proto}://${seen}`;

    // The key lives behind a one-time link rather than inline. A thousand
    // characters of base64 is pasted unread; a short command can be read, and
    // the URL it names can be opened in a browser first.
    const token = host
      ? stash(setupScript(key.privateKey, invite.key, user, host, machine, meshAddress, origin))
      : null;

    return NextResponse.json(
      {
        // Deliberately not the auth key itself. It is inside the script now,
        // behind a link that works once; putting it in the page as well would
        // be a second copy with a longer life and no reason to exist.
        expires: invite.expires,
        expiresIn: invite.expiresIn,
        install: installCommand(platform),
        setup: token ? setupCommand(origin, token) : null,
        ssh: host ? sshCommand(host) : null,
        host,
        // The fingerprint is what the device is about to sign for.
        operator: key.operator,
        fingerprint: key.fingerprint,
      },
      // Belt and braces: none of this may sit in a shared cache.
      { headers: { "cache-control": "no-store, private" } },
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
