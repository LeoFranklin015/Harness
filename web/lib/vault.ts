import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { ring } from "./agent-root";

/**
 * What an Agent is given to work with, sealed under its Tenant's ring.
 *
 * An Agent that does anything real needs credentials this system did not mint
 * — a model API key, a token for some service it is meant to use. Those cannot
 * be derived from a root the way its own key is; somebody has to type them in.
 * So the question is only where they rest afterwards.
 *
 * They rest as wallet-cli ciphertext, next to the agent root and opened the
 * same way: by a member of the Tenant's Ledger Key Ring, and by nobody else. A
 * disk taken from this host yields nothing. Removing this host from the ring
 * rotates the ring's key and makes every one of these files dead at once.
 *
 * They are not handed to the container at creation. `podman inspect` prints
 * environment for anyone who can run it, and a value passed that way outlives
 * the reason it was passed. Instead the Runner asks the broker for them at
 * start, over its own private network, and the broker answers only while the
 * chain still says that Agent may act — so revoking an Agent takes its
 * credentials away on the next restart along with everything else.
 */

const ENROLMENT_DIR =
  process.env.ENROLMENT_DIR || path.join(homedir(), ".config", "agentauth", "enrolments");

/** The wallet-cli key name. Distinct from the agent root's, so the two are separable. */
const KEY_NAME = "harness-secrets";

const sealedPath = (tenant: string, agent: string) =>
  path.join(ENROLMENT_DIR, "secrets", `${tenant}.${agent}.enc`);

export type Secrets = Record<string, string>;

/** A name a shell will accept as a variable, so nothing here can inject. */
export function validName(name: string): boolean {
  return /^[A-Z][A-Z0-9_]{0,63}$/.test(name);
}

/**
 * Seals what an Agent was given. Replaces wholesale rather than merging: the
 * set of credentials an Agent holds should be visible in one place at one
 * moment, not accumulated by forgotten additions.
 */
export function sealSecrets(tenant: string, agent: string, secrets: Secrets): void {
  for (const name of Object.keys(secrets)) {
    if (!validName(name)) throw new Error(`${name} is not a usable variable name`);
  }
  const file = sealedPath(tenant, agent);
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, ring(tenant, "encrypt", Buffer.from(JSON.stringify(secrets), "utf8"), KEY_NAME), {
    mode: 0o600,
  });
}

/** Opens them. Absent is not an error: most Agents are given nothing. */
export function openSecrets(tenant: string, agent: string): Secrets {
  const file = sealedPath(tenant, agent);
  if (!existsSync(file)) return {};
  const opened = ring(tenant, "decrypt", readFileSync(file), KEY_NAME);
  const parsed = JSON.parse(opened.toString("utf8")) as Secrets;
  return parsed && typeof parsed === "object" ? parsed : {};
}

/** Whether an Agent was given anything, without opening the ring to find out. */
export function hasSecrets(tenant: string, agent: string): boolean {
  return existsSync(sealedPath(tenant, agent));
}

/**
 * How an Agent's brain is told who it is.
 *
 * Three ways, because people have one of them and rarely two. An API key bills
 * per token against an Anthropic or OpenAI account. A subscription token comes
 * from `claude setup-token` on a machine where somebody has already signed in
 * to a Pro, Max or Team plan, and bills against that plan instead — which is
 * the one most people actually have.
 *
 * They are all just secrets. The only reason any of this is named is that the
 * Runner has to know which variable to set and which command to launch, and
 * getting either wrong leaves a CLI asking a question with nobody there.
 */
export const BRAINS = {
  "claude-plan": { env: "CLAUDE_CODE_OAUTH_TOKEN", brain: "claude" },
  "claude-key": { env: "ANTHROPIC_API_KEY", brain: "claude" },
  "codex-key": { env: "OPENAI_API_KEY", brain: "codex" },
} as const;

export type BrainChoice = keyof typeof BRAINS | "none";

/** Which command a Runner starts a shell in. Sealed with the credential. */
export const BRAIN_VAR = "HARNESS_BRAIN";
