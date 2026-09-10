"use client";

/**
 * A GET with a deadline and no retry.
 *
 * There was a retry here and it made things worse. Aborting a fetch does not
 * stop the server working on it, so a short deadline plus a retry generated
 * more concurrent work than the original request, which slowed the server,
 * which tripped more deadlines. The loop is easy to build and hard to see.
 *
 * One attempt, a generous deadline, and the next poll is the retry.
 */
export async function getJson<T>(url: string, ms = 12_000): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(ms) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}
