import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { secp256k1 } from "@noble/curves/secp256k1.js";

/**
 * An enrolment is the handshake that admits a Tenant's broker to their Ledger
 * Key Ring. The device is needed exactly once, to create the ring; admitting
 * the broker afterwards is a software operation.
 *
 * The broker's keypair belongs to the **Tenant**, not to the enrolment. A ring
 * member cannot be removed without rotating the ring and invalidating every
 * ciphertext under it, so minting a key per attempt would make repeated
 * onboarding accumulate members permanently. Re-running enrolment is therefore
 * idempotent: the same broker rejoins, and `getMembers` stays where it was.
 */
export type Enrolment = {
  id: string;
  tenant: string;
  /** The Tenant's broker: a compressed secp256k1 public key, 66 hex chars. */
  memberPubkey: string;
  status: "awaiting-device" | "enrolled";
  createdAt: string;
  /** Set once the ring exists. Belongs to the Tenant, not this attempt. */
  rootId?: string;
  applicationPath?: string;
  enrolledAt?: string;
};

type TenantRecord = {
  tenant: string;
  memberPubkey: string;
  rootId?: string;
  applicationPath?: string;
  enrolledAt?: string;
};

const ROOT =
  process.env.ENROLMENT_DIR ||
  path.join(homedir(), ".config", "agentauth", "enrolments");

const TENANTS = path.join(ROOT, "tenants");
// Broker private keys live apart from anything the API serves, so a bug in a
// route cannot return one by accident.
const KEYS = path.join(ROOT, "keys");

const tenantPath = (t: string) => path.join(TENANTS, `${t}.json`);
const keyPath = (t: string) => path.join(KEYS, `${t}.key`);
const enrolmentPath = (id: string) => path.join(ROOT, `${id}.json`);

function ensureDirs() {
  for (const d of [ROOT, TENANTS, KEYS]) mkdirSync(d, { recursive: true, mode: 0o700 });
}

/** The Tenant's broker keypair, generated on first use and reused thereafter. */
export function brokerCredentials(tenant: string): { pubkey: string; privatekey: string } {
  const pubkey = brokerPubkey(tenant); // creates the key on first use
  return { pubkey, privatekey: readFileSync(keyPath(tenant), "utf8").trim() };
}

function brokerPubkey(tenant: string): string {
  ensureDirs();
  if (!existsSync(keyPath(tenant))) {
    const priv = secp256k1.utils.randomSecretKey();
    writeFileSync(keyPath(tenant), Buffer.from(priv).toString("hex"), { mode: 0o600 });
  }
  const priv = Buffer.from(readFileSync(keyPath(tenant), "utf8").trim(), "hex");
  return Buffer.from(secp256k1.getPublicKey(priv, true)).toString("hex");
}

function readTenant(tenant: string): TenantRecord | undefined {
  const p = tenantPath(tenant);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as TenantRecord) : undefined;
}

function view(e: { id: string; tenant: string; createdAt: string }): Enrolment {
  const t = readTenant(e.tenant);
  return {
    ...e,
    memberPubkey: brokerPubkey(e.tenant),
    status: t?.rootId ? "enrolled" : "awaiting-device",
    rootId: t?.rootId,
    applicationPath: t?.applicationPath,
    enrolledAt: t?.enrolledAt,
  };
}

export function createEnrolment(tenant: string): Enrolment {
  ensureDirs();
  const record = { id: randomBytes(8).toString("hex"), tenant, createdAt: new Date().toISOString() };
  writeFileSync(enrolmentPath(record.id), JSON.stringify(record, null, 2), { mode: 0o600 });
  return view(record);
}

export function getEnrolment(id: string): Enrolment | undefined {
  if (!/^[0-9a-f]{16}$/.test(id) || !existsSync(enrolmentPath(id))) return undefined;
  return view(JSON.parse(readFileSync(enrolmentPath(id), "utf8")));
}

export function completeEnrolment(
  id: string,
  rootId: string,
  applicationPath: string
): Enrolment | undefined {
  const e = getEnrolment(id);
  if (!e) return undefined;
  const record: TenantRecord = {
    tenant: e.tenant,
    memberPubkey: e.memberPubkey,
    rootId,
    applicationPath,
    enrolledAt: new Date().toISOString(),
  };
  writeFileSync(tenantPath(e.tenant), JSON.stringify(record, null, 2), { mode: 0o600 });
  return getEnrolment(id);
}
