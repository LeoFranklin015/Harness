/**
 * Runs once, before the server takes its first request.
 *
 * Only to open the database connection early. A hosted cluster's first
 * handshake is seconds of SRV lookup, TLS and auth, and every route waits on
 * the same shared promise — so without this the first person to load the
 * dashboard pays for all of it, and the page looks broken rather than slow.
 */
export async function register() {
  // The same file is evaluated for the edge runtime, which has no driver.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { warm } = await import("@/lib/store");
  await warm();
}
