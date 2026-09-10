import { execFileSync } from "node:child_process";
import { hkdfSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * The root every Agent key of a Tenant derives from — sealed under that
 * Tenant's Ledger Key Ring, and opened only to derive.
 *
 * The ring step of onboarding admitted this host to the ring; this is what that
 * was for. The root is 32 random bytes that exist in the clear only inside the
 * process deriving from them. At rest it is wallet-cli's ciphertext, which any
 * member of the ring can open — so it is recoverable from the Ledger's seed on
 * a new host, and unreadable to anyone who has only the disk. Removing this
 * host from the ring rotates the ring's key and makes the ciphertext dead.
 *
 * One root per Tenant because one ring per Tenant: the Ledger that roots the
 * registry is the Ledger that can unseal the keys. Siblings still cannot
 * impersonate each other, because a container receives only its own derived key.
 */

const ENROLMENT_DIR =
  process.env.ENROLMENT_DIR || path.join(homedir(), ".config", "agentauth", "enrolments");
const RING = process.env.HARNESS_RING ?? "/home/opc/hackathon/tools/harness-ring";
/** The wallet-cli key name. Yours to `wallet-cli ring decrypt --key` on a laptop in the ring. */
const KEY_NAME = "harness-agents";

const sealedPath = (tenant: string) => path.join(ENROLMENT_DIR, "roots", `${tenant}.enc`);

function ring(tenant: string, op: "encrypt" | "decrypt", input: Buffer): Buffer {
  return execFileSync(RING, [tenant, op, "--key", KEY_NAME], {
    input,
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 1 << 20,
  });
}

/** The Tenant's root, created and sealed on first use. Never written in the clear. */
export function agentRootFor(tenant: string): Buffer {
  const file = sealedPath(tenant);
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const sealed = ring(tenant, "encrypt", randomBytes(32));
    writeFileSync(file, sealed, { mode: 0o600 });
  }
  const root = ring(tenant, "decrypt", readFileSync(file));
  if (root.length !== 32) throw new Error(`agent root for ${tenant} opened to ${root.length} bytes`);
  return root;
}

/** One Agent's key, derived and gone. Same derivation as `x402/keys.ts`. */
export function agentKeyFor(tenant: string, label: string): { pk: Hex; address: Address } {
  const bytes = hkdfSync("sha256", agentRootFor(tenant), Buffer.alloc(0), `harness/agent/${tenant}/${label}`, 32);
  const pk = `0x${Buffer.from(bytes).toString("hex")}` as Hex;
  return { pk, address: privateKeyToAccount(pk).address };
}
