import { randomBytes } from "node:crypto";

/**
 * Something handed over once, to whoever asks first.
 *
 * The setup a visitor runs contains a private key, and a private key inlined
 * into a shell command is a thousand characters of base64 that nobody can read
 * and everybody pastes anyway. Putting it behind a URL makes the
 * command short enough to look at, which is the only way anyone is ever going
 * to look at it.
 *
 * Held in memory and nowhere else:
 *
 *   short lived  minutes, and swept on every access rather than by a timer
 *   unguessable  256 bits from the system CSPRNG
 *   not on disk  a restart forgets every outstanding handoff
 *
 * Readable more than once, deliberately. It was single-use for a while, which
 * sounds stricter and was in fact incoherent: the point of moving the key
 * behind a link was that a person could open it and read the script before
 * running it, and a link that dies on the first read makes that impossible —
 * you get to read it or run it, never both.
 *
 * Nothing much is lost. The URL is unguessable and lives for minutes, and the
 * key it carries is worth something only while the chain still names its
 * fingerprint — which stops the moment the Tenant mints the next invite, since
 * there is one operator at a time and signing a new one overwrites the last.
 * The authority was never in this token, and pretending otherwise bought
 * nothing but a broken instruction.
 *
 * This is deliberately not a store. Nothing is meant to survive here, and
 * anything that needs to survive belongs on chain.
 */

type Held = { body: string; expires: number };

const held = new Map<string, Held>();

/** How long a visitor has to run the command before the link is dead. */
const TTL_MS = 15 * 60 * 1000;

function sweep(now: number) {
  for (const [token, item] of held) if (item.expires <= now) held.delete(token);
}

/** Puts something behind a fresh one-time token and returns the token. */
export function stash(body: string): string {
  const now = Date.now();
  sweep(now);
  // Base64url: it ends up in a URL that someone types or pastes, so it must
  // survive a shell and a copy without quoting.
  const token = randomBytes(32).toString("base64url");
  held.set(token, { body, expires: now + TTL_MS });
  return token;
}

/** Reads it. Good until it expires, so it can be read and then run. */
export function fetchHeld(token: string): string | null {
  const now = Date.now();
  sweep(now);
  return held.get(token)?.body ?? null;
}
