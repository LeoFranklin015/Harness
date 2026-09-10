// The metadata that is not on chain.
//
// A Grant lives on chain only as a hash, so anyone acting under one has to
// resupply the struct byte for byte — timestamps included. Something has to
// keep that copy. It used to be `x402/grants/*.json`, committed to the repo,
// which is wrong twice over: it publishes every Agent's key, ceiling and
// window to anyone who clones, and a file per Agent enforces no limit on how
// many Agents there are.
//
// Neither is a *security* boundary — the registry checks the hash, so an
// edited record grants nothing and a stolen one is worth nothing without the
// sealed root that derives the key. But a public roster of what exists and
// what each thing may spend is reconnaissance handed over for free, and the
// slot cap is a real rule that a directory listing cannot express.
//
// So: one database, two collections, and the cap lives where it can be
// enforced rather than in a constant the browser is trusted to respect.
//
// It lives here rather than beside the broker because the dashboard's bundler
// will not reach outside its own directory, and node will reach in from
// anywhere. Set `MONGODB_URI` to the cluster; there is no local default,
// because a store that silently falls back to an empty one on this host would
// look like every Agent having been forgotten.

import { MongoClient, type Collection, type Db } from "mongodb";
import type { Address, Hex } from "viem";

const URI = process.env.MONGODB_URI ?? "";
const DB_NAME = process.env.MONGODB_DB ?? "harness";

/** How many machines one device may hold at once. */
export const MAX_SLOTS = Number(process.env.HARNESS_SLOTS ?? 2);

/** What the device signed, kept so it can be resupplied to the registry. */
export type GrantRecord = {
  _id: string;
  tenant: string;
  label: string;
  agentKey: Address;
  start: number;
  end: number;
  cap: string;
  registry: Address;
  agentId: Hex;
  createdAt: Date;
};

/** A machine, and where its provisioning got to. */
export type TenantRecord = {
  _id: string;
  authority: string;
  label: string;
  registry: Address;
  meshAddress: string | null;
  agent: string | null;
  cap: string;
  status: "provisioning" | "live" | "revoked";
  agentId?: Hex;
  request?: unknown;
  slot: number;
  updatedAt: Date;
};

/**
 * One client for the process.
 *
 * The driver pools connections itself, so a second client would be a second
 * pool for no reason. Held as the promise rather than the resolved value so
 * that concurrent first callers wait on one connect instead of racing.
 */
let opening: Promise<Db> | null = null;

function db(): Promise<Db> {
  if (!URI) throw new Error("set MONGODB_URI — the metadata store is not optional");
  if (!opening) {
    opening = new MongoClient(URI, { serverSelectionTimeoutMS: 5_000 })
      .connect()
      .then(async (client) => {
        const d = client.db(DB_NAME);
        // A Grant is identified by tenant and label everywhere else, so make
        // the database agree rather than trusting every writer to.
        await d.collection("grants").createIndex({ tenant: 1, label: 1 }, { unique: true });
        await d.collection("tenants").createIndex({ authority: 1 });
        return d;
      })
      .catch((err) => {
        // Otherwise a failed connect is cached and every later call fails
        // against a promise from minutes ago.
        opening = null;
        // Deliberately not naming the URI: it carries the password.
        throw new Error(`cannot reach the metadata store: ${err.message}`);
      });
  }
  return opening;
}

async function grants(): Promise<Collection<GrantRecord>> {
  return (await db()).collection<GrantRecord>("grants");
}

async function tenants(): Promise<Collection<TenantRecord>> {
  return (await db()).collection<TenantRecord>("tenants");
}

const grantId = (tenant: string, label: string) => `${tenant}.${label}`;

// --- grants -----------------------------------------------------------------

export async function saveGrant(g: Omit<GrantRecord, "_id" | "createdAt">): Promise<void> {
  const c = await grants();
  await c.updateOne(
    { _id: grantId(g.tenant, g.label) },
    { $set: { ...g }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );
}

export async function findGrant(tenant: string, label: string): Promise<GrantRecord | null> {
  const c = await grants();
  // The bare label is what the scripted demo Agents wrote before Tenants were
  // a thing, and their records are still readable.
  return (await c.findOne({ tenant, label })) ?? (await c.findOne({ _id: label }));
}

export async function listGrants(tenant?: string): Promise<GrantRecord[]> {
  const c = await grants();
  return c.find(tenant ? { tenant } : {}).sort({ createdAt: 1 }).toArray();
}

// --- slots ------------------------------------------------------------------

/**
 * The machines a device holds, newest last, as many as there are slots.
 *
 * Revoked machines still count as records but not as slots: revoking is how
 * you free one, which is the only reason the cap is bearable.
 */
export async function slotsOf(authority: string): Promise<TenantRecord[]> {
  const c = await tenants();
  return c
    .find({ authority: authority.toLowerCase(), status: { $ne: "revoked" } })
    .sort({ slot: 1 })
    .toArray();
}

/**
 * Whether `authority` may take `slot`, and why not if not.
 *
 * Checked here rather than in the page because the page is the one thing that
 * cannot enforce it: clearing site data resets a browser-side count, and two
 * tabs do not see each other's.
 */
export async function slotAvailable(
  authority: string,
  slot: number,
  label: string,
): Promise<{ ok: true } | { ok: false; why: string }> {
  if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_SLOTS) {
    return { ok: false, why: `there are ${MAX_SLOTS} slots, numbered 0 to ${MAX_SLOTS - 1}` };
  }
  const held = await slotsOf(authority);
  const sitting = held.find((t) => t.slot === slot);
  if (sitting && sitting.label !== label) {
    return { ok: false, why: `slot ${slot} holds ${sitting.label}; revoke it first` };
  }
  if (!sitting && held.length >= MAX_SLOTS) {
    return { ok: false, why: `all ${MAX_SLOTS} slots are taken; revoke one first` };
  }
  const taken = await (await tenants()).findOne({ _id: label });
  if (taken && taken.authority !== authority.toLowerCase()) {
    return { ok: false, why: `${label} belongs to another device` };
  }
  return { ok: true };
}

export async function saveTenant(t: Omit<TenantRecord, "updatedAt">): Promise<void> {
  const c = await tenants();
  await c.updateOne(
    { _id: t.label },
    { $set: { ...t, authority: t.authority.toLowerCase(), updatedAt: new Date() } },
    { upsert: true },
  );
}

export async function markRevoked(label: string): Promise<void> {
  const c = await tenants();
  await c.updateOne({ _id: label }, { $set: { status: "revoked", updatedAt: new Date() } });
}
