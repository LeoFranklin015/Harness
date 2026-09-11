import { NextResponse } from "next/server";
import { BOX, forwardToBox } from "@/lib/box";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Asks the terminal server for one shell.
 *
 * The token it returns is worth one websocket and about a minute. It is not the
 * thing that decides whether a shell may exist — the terminal server asks the
 * chain for that, on connect and then every fifteen seconds — it only decides
 * which browser tab gets the one being opened.
 *
 * Minting is loopback-only on the terminal server's side, so this route is the
 * only way to reach it, and this route exists behind a dashboard that already
 * required a device to show anything at all.
 */

const TERMINAL = process.env.HARNESS_TERMINAL ?? "http://127.0.0.1:8023";

export async function POST(request: Request) {
  // The terminal server is loopback-only on the box, by design.
  if (BOX) return forwardToBox(request);

  const { tenant, agent } = (await request.json().catch(() => ({}))) as {
    tenant?: string;
    agent?: string;
  };

  // Both end up in a URL and then in a container name, so they are held to the
  // shape of a label rather than escaped later.
  const t = (tenant ?? "").replace(/[^a-z0-9-]/g, "");
  const a = (agent ?? "").replace(/[^a-z0-9-]/g, "");
  if (!t || !a) return NextResponse.json({ error: "which machine?" }, { status: 400 });

  try {
    const res = await fetch(`${TERMINAL}/mint?tenant=${t}&agent=${a}`, {
      method: "POST",
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`the terminal server answered ${res.status}`);
    const { token, port } = (await res.json()) as { token: string; port: number };
    return NextResponse.json({ token, port }, { headers: { "cache-control": "no-store, private" } });
  } catch {
    // Said plainly, because the usual cause is that it is simply not running.
    return NextResponse.json(
      { error: "The terminal server is not reachable. Start it with `harness up`." },
      { status: 502 },
    );
  }
}
