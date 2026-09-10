import { fetchHeld } from "@/lib/handoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hands the setup script over, for the few minutes it is good for.
 *
 * Served as plain text on purpose. The whole argument for `curl … | sh` here
 * rather than a thousand characters of base64 in the clipboard is that a
 * person can open the URL in a browser and read the thirty lines first — which
 * only holds if the browser shows it instead of downloading it, and if reading
 * it does not consume it. It was single-use once, and that made the advice to
 * read it first impossible to follow.
 *
 * What limits it is the clock and the chain: the link lives for minutes, and
 * the key it carries only opens anything while the chain still names its
 * fingerprint, which ends the moment the Tenant signs the next invite.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const body = fetchHeld(token);
  if (!body) {
    return new Response(
      "This link has expired.\n" +
        "Ask for another invite — it costs nothing, and the one that expired is now worthless.\n",
      { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } },
    );
  }

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // Never in a shared cache, and never in a proxy's disk.
      "cache-control": "no-store, private",
      // It is a script; do not let a browser decide it is something else.
      "x-content-type-options": "nosniff",
    },
  });
}
