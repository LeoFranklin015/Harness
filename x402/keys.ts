// Where an Agent Key comes from.
//
// Not from the Ledger Key Ring directly, though that is the tempting shape. The
// ring shares one root across every member, so `HKDF(ringRoot, label)` would let
// any member derive *every* Agent's key — a compromised `research` container
// could then act as `scout`, up to scout's Grant. Siblings must not be able to
// impersonate each other; that isolation is most of what the hierarchy is for.
//
// So the ring seals, and a separate root derives:
//
//   each Tenant has an agent root secret, sealed at rest under that Tenant's
//     ring with `wallet-cli ring encrypt --key harness-agents` (through
//     `tools/harness-ring`, which lends wallet-cli the member this host joined
//     as). Recoverable on any machine in the ring, therefore from the Ledger seed.
//
//   each Agent's key is HKDF(root, "harness/agent/<tenant>/<label>")
//
//   the container is given only its own key, never the root, so it can derive
//     nothing but itself
//
// The VPS can therefore compute an Agent's address before its container exists,
// which is what lets the device sign a Grant ahead of time rather than once per
// container start.

import { execFileSync } from "node:child_process";
import { hkdfSync, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

const ROOT_PATH = new URL("./.agent-root", import.meta.url);
const ENROLMENT_DIR =
  process.env.ENROLMENT_DIR || path.join(homedir(), ".config", "agentauth", "enrolments");
const RING = new URL("../tools/harness-ring", import.meta.url).pathname;

/**
 * The agent root secret for one Tenant.
 *
 * A Tenant that has been through the ring has its root sealed at
 * `roots/<tenant>.enc`, and it is opened here on each use, never written in the
 * clear. Tenants from before the ring (the scripted demo ones) fall back to the
 * shared plaintext file, which is why that file is gitignored.
 */
export function agentRoot(tenant?: string): Buffer {
  const sealed = tenant && path.join(ENROLMENT_DIR, "roots", `${tenant}.enc`);
  if (sealed && existsSync(sealed)) {
    return execFileSync(RING, [tenant, "decrypt", "--key", "harness-agents"], {
      input: readFileSync(sealed),
      stdio: ["pipe", "pipe", "pipe"],
    });
  }
  if (!existsSync(ROOT_PATH)) {
    const secret = randomBytes(32);
    writeFileSync(ROOT_PATH, secret.toString("hex"));
    chmodSync(ROOT_PATH, 0o600);
    return secret;
  }
  return Buffer.from(readFileSync(ROOT_PATH, "utf8").trim(), "hex");
}

/** The key for one Agent, and nothing else. */
export function agentKey(tenant: string, label: string): Hex {
  const info = `harness/agent/${tenant}/${label}`;
  const bytes = hkdfSync("sha256", agentRoot(tenant), Buffer.alloc(0), info, 32);
  return `0x${Buffer.from(bytes).toString("hex")}` as Hex;
}

/** What the device needs to sign a Grant, before the container exists. */
export function agentAddress(tenant: string, label: string): string {
  return privateKeyToAccount(agentKey(tenant, label)).address;
}

if (import.meta.filename === process.argv[1]) {
  const [, , tenant = "demo", label] = process.argv;
  if (!label) {
    console.error("usage: keys.ts <tenant> <label>   — prints the Agent's address");
    process.exit(1);
  }
  console.log(agentAddress(tenant, label));
}

/**
 * What an Agent was given at provisioning, opened from the same ring.
 *
 * Credentials the Agent needs and this system did not mint — a model API key,
 * a token for some service. They cannot be derived the way its own key is, so
 * somebody typed them in once and they have been wallet-cli ciphertext ever
 * since, next to the agent root and openable by the same Ledger Key Ring.
 *
 * Absent is not an error. Most Agents are given nothing.
 */
export function agentSecrets(tenant: string, label: string): Record<string, string> {
  const sealed = path.join(ENROLMENT_DIR, "secrets", `${tenant}.${label}.enc`);
  if (!existsSync(sealed)) return {};

  const opened = execFileSync(RING, [tenant, "decrypt", "--key", "harness-secrets"], {
    input: readFileSync(sealed),
    stdio: ["pipe", "pipe", "pipe"],
  });

  const parsed: unknown = JSON.parse(opened.toString("utf8"));
  return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
}
