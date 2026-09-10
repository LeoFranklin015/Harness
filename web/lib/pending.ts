import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { ring } from "./agent-root";

/**
 * What agents have asked for and cannot do themselves.
 *
 * An Agent that hits its ceiling cannot raise it — that is the whole point of
 * a ceiling. What it can do is say what it needs and why, and wait. Those asks
 * are sealed under the tenant's ring by the broker, so an ask cannot be edited
 * on disk between being made and being read. A request a person is about to
 * approve with their device is worth exactly as much as it is tamper-evident.
 *
 * Reading one grants nothing. Approving means signing a new Grant, on the
 * device, which is the only thing that ever moves a ceiling.
 */

const ENROLMENT_DIR =
  process.env.ENROLMENT_DIR || path.join(homedir(), ".config", "agentauth", "enrolments");

const dir = () => path.join(ENROLMENT_DIR, "pending");

const KEY_NAME = "harness-secrets";

export type Ask = {
  id: string;
  tenant: string;
  label: string;
  /** What the Agent wants to do, in its own words. */
  want: string;
  /** Why it thinks that is worth doing. */
  why: string;
  /** What it would cost, in dollars. */
  usd: number;
  /** When it asked, epoch ms. */
  asked: number;
};

/** Everything one tenant's agents are waiting on, oldest first. */
export function asksFor(tenant: string): Ask[] {
  const at = dir();
  if (!existsSync(at)) return [];

  const out: Ask[] = [];
  for (const file of readdirSync(at)) {
    if (!file.startsWith(`${tenant}.`) || !file.endsWith(".enc")) continue;
    try {
      const opened = ring(tenant, "decrypt", readFileSync(path.join(at, file)), KEY_NAME);
      out.push(JSON.parse(opened.toString("utf8")) as Ask);
    } catch {
      // A file that will not open is not an ask. It is either a ring that has
      // rotated or something that does not belong here; either way, silence is
      // wrong but so is failing the whole list for one bad file.
      continue;
    }
  }
  return out.sort((a, b) => a.asked - b.asked);
}

/**
 * Forgets one ask, whichever way it was decided.
 *
 * Approving and declining both end here, because the record of what happened
 * is the chain — a Grant that now exists, or does not. Keeping a pile of
 * settled asks would be a second history to disagree with the first.
 */
export function settle(tenant: string, id: string): boolean {
  const at = dir();
  if (!existsSync(at)) return false;

  const safe = /^[a-z0-9]+$/.test(id) && /^[a-z0-9-]+$/.test(tenant);
  if (!safe) return false;

  let gone = false;
  for (const file of readdirSync(at)) {
    if (file.startsWith(`${tenant}.`) && file.endsWith(`.${id}.enc`)) {
      rmSync(path.join(at, file), { force: true });
      gone = true;
    }
  }
  return gone;
}

/** So the broker and the dashboard agree on where these live. */
export function pendingDir(): string {
  mkdirSync(dir(), { recursive: true, mode: 0o700 });
  return dir();
}
