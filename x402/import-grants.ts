// One-time: move the Grant records out of `x402/grants/` and into the store.
//
// Kept because the files are what a clone of this repo used to come with, and
// anyone upgrading a running host has a directory of them to bring across.
// Safe to run twice — every write is keyed by tenant and label.
//
//   MONGODB_URI=… node --experimental-strip-types x402/import-grants.ts

import { existsSync, readdirSync, readFileSync } from "node:fs";
import type { Address } from "viem";
import { listGrants, saveGrant, saveTenant } from "../web/lib/store.ts";
import { publicClient, REGISTRY_ABI } from "./harness.ts";

const dir = new URL("./grants/", import.meta.url);
if (!existsSync(dir)) {
  console.log("no grants/ directory — nothing to bring across");
  process.exit(0);
}

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const g = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
  // `<tenant>.<label>.json`, or a bare `<label>.json` from before Tenants.
  const base = file.replace(/\.json$/, "");
  const dot = base.indexOf(".");
  const tenant = dot > 0 ? base.slice(0, dot) : "demo";
  const label = dot > 0 ? base.slice(dot + 1) : base;

  await saveGrant({
    tenant,
    label,
    agentKey: g.agentKey,
    start: g.start,
    end: g.end,
    cap: g.cap,
    registry: g.registry,
    agentId: g.agentId,
  });
  console.log(`  grant   ${tenant}.${label}`);
}

// The slots the dashboard shows. Which device holds a machine is not in the
// file — it is on chain, as the registry's root device, which is the only
// place worth trusting for it anyway.
let slot = 0;
for (const g of await listGrants()) {
  const authority = (await publicClient.readContract({
    address: g.registry,
    abi: REGISTRY_ABI,
    functionName: "rootDevice",
  })) as Address;

  const live = (await publicClient.readContract({
    address: g.registry,
    abi: REGISTRY_ABI,
    functionName: "agentKeyOf",
    args: [g.label],
  })) as Address;

  const status = live === "0x0000000000000000000000000000000000000000" ? "revoked" : "live";
  await saveTenant({
    _id: g.tenant,
    authority,
    slot: slot++,
    label: g.tenant,
    registry: g.registry,
    meshAddress: null,
    agent: g.label,
    cap: `$${Number(g.cap) / 1e6}/day`,
    status,
    agentId: g.agentId,
  });
  console.log(`  slot ${slot - 1}  ${g.tenant}  ${status}`);
}

process.exit(0);
