/**
 * One door, two kinds of caller.
 *
 * The dashboard drives ten routes that act — provision a machine, revoke a
 * Grant, mint a mesh invite, put a transaction in front of the device. On a
 * box with port 3000 open that is a control panel anybody can find, so it is
 * gated.
 *
 * An API key would not do it. Anything the browser holds is readable by
 * whoever has the browser, so a key shipped to the page is a key published.
 * What the browser gets instead is a cookie it cannot forge: the passcode
 * stays on the server, and the cookie carries only what the passcode derives
 * to. Nothing is stored between requests — the check recomputes the digest —
 * so there is no session table to keep, expire or leak.
 *
 * The broker is the other caller and cannot hold a cookie, so it presents a
 * bearer token on the one route it uses.
 */

const SESSION = "harness-session-v1";

/** The cookie the browser carries. Derived, so nothing has to be stored. */
export async function sessionToken(passcode: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passcode),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(SESSION));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Compares without leaking where two values first differ.
 *
 * The passcode itself is guessed offline and a timing side channel on it
 * would be academic, but the cookie is compared against the derived token,
 * and that one an attacker can probe a byte at a time.
 */
export function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const COOKIE = "harness_session";
