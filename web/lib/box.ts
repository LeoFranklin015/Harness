/**
 * The machine that has the machines.
 *
 * Most of this app is happy anywhere: it reads the chain, reads a database,
 * and hands the browser something to sign. Five routes are not, because they
 * do things that only exist on one computer — run `podman` to build a
 * container, `forge` to deploy its executor, derive an Agent's key from a
 * sealed root on that disk, write the ring's identity into that kernel
 * keyring.
 *
 * So the app is deployed where a certificate is easy to come by, and those
 * five routes forward to the box instead of pretending. `HARNESS_BOX` is what
 * makes the difference: set, this instance is the deployed one and forwards;
 * unset, this instance *is* the box and does the work. The same code is both,
 * which is the only version of this that stays true after somebody edits a
 * route and forgets there were two copies.
 *
 * The box refuses anything without `x-harness-origin`, so that goes on every
 * forwarded request. See `proxy.ts`.
 */

/** Where the box is, if this instance is not it. */
export const BOX = process.env.HARNESS_BOX?.replace(/\/$/, "");

const TOKEN = process.env.HARNESS_ORIGIN_TOKEN;

/** Headers a proxy must not copy: they describe the old hop, not the new one. */
const HOP = new Set(["host", "connection", "keep-alive", "transfer-encoding", "upgrade"]);

/**
 * Replays a request at the box and streams the answer back.
 *
 * The body is piped rather than buffered — provisioning reports its progress
 * as it happens, and a caller watching a machine get built should see the
 * steps arrive, not a transcript once it is over.
 */
export async function forwardToBox(request: Request): Promise<Response> {
  if (!BOX) throw new Error("forwardToBox called with no HARNESS_BOX set");

  const here = new URL(request.url);
  const target = `${BOX}${here.pathname}${here.search}`;

  const headers = new Headers();
  request.headers.forEach((v, k) => {
    if (!HOP.has(k.toLowerCase())) headers.set(k, v);
  });
  if (TOKEN) headers.set("x-harness-origin", TOKEN);

  const res = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    // Node's fetch needs to be told a streamed body is one-directional.
    ...({ duplex: "half" } as RequestInit),
    cache: "no-store",
  });

  const out = new Headers(res.headers);
  HOP.forEach((h) => out.delete(h));
  // Keeps the stream a stream all the way to the browser.
  out.delete("content-encoding");
  out.delete("content-length");

  return new Response(res.body, { status: res.status, headers: out });
}
