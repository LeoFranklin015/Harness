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
//   the VPS holds an agent root secret, sealed at rest by the ring
//     (`wallet-cli ring encrypt --key harness-agents`), recoverable on any
//     machine in the ring and therefore from the Ledger seed
//
//   each Agent's key is HKDF(root, "harness/agent/<tenant>/<label>")
//
//   the container is given only its own key, never the root, so it can derive
//     nothing but itself
//
// The VPS can therefore compute an Agent's address before its container exists,
// which is what lets the device sign a Grant ahead of time rather than once per
// container start.

import { hkdfSync, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { chmodSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

const ROOT_PATH = new URL("./.agent-root", import.meta.url);

/**
 * The agent root secret.
 *
 * In production this file is the ring's ciphertext and is decrypted on use. Here
 * it is written in the clear on first run, which is why it is gitignored and why
 * this is a development path rather than the design.
 */
export function agentRoot(): Buffer {
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
  const bytes = hkdfSync("sha256", agentRoot(), Buffer.alloc(0), info, 32);
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
