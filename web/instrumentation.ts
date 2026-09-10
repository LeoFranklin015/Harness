/**
 * Runs once, before the server takes its first request.
 *
 * Opens the database connection early, but deliberately does not wait for
 * it. `register` must finish before the server will answer anything, so
 * awaiting a hosted cluster's handshake here does not warm the first request
 * — it delays every request by the length of the handshake, which is worse
 * than the problem it was added to solve.
 *
 * Kicking it off unawaited gets the same benefit: by the time a browser has
 * loaded the page and mounted a panel, the connection is usually up, and any
 * request that does arrive first simply waits on the same promise it would
 * have created itself.
 */
export async function register() {
  // The same file is evaluated for the edge runtime, which has no driver.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { warm } = await import("@/lib/store");
  void warm();
}
