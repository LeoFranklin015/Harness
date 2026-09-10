// Loading a Grant back.
//
// A Grant lives on-chain only as a hash, so anyone who needs to act under one
// has to resupply the struct byte for byte — timestamps included. That is what
// makes issuing cheap, and it is why the issuer writes every Grant it signs
// into `grants/`: the chain will not hand it back.

import { existsSync, readFileSync } from "node:fs";
import { keccak256, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { agentKey } from "./keys.ts";
import { USDC, type Grant } from "./harness.ts";

export type Issued = {
  grant: Grant;
  registry: Address;
  /** This Tenant's registry roots its own tree, so it is its own EIP-712 domain. */
  rootOfTree: Address;
  agentPk: Hex;
  name: string;
};

export function load(label: string, tenant = "demo"): Issued {
  // Two Tenants may both call an Agent `runner`, so a Grant is filed under
  // both names. The bare name is what the scripted demo Tenants wrote before
  // Tenants were a thing.
  const scoped = new URL(`./grants/${tenant}.${label}.json`, import.meta.url);
  const bare = new URL(`./grants/${label}.json`, import.meta.url);
  const file = existsSync(scoped) ? scoped : bare;
  const raw = JSON.parse(readFileSync(file, "utf8"));

  // The Agent's key, derived from the VPS's sealed root. See `keys.ts` for why
  // it is not derived from the ring itself.
  let agentPk = agentKey(tenant, label);

  if (privateKeyToAccount(agentPk).address.toLowerCase() !== raw.agentKey.toLowerCase()) {
    // Agents granted before `keys.ts` existed carry a key derived from a public
    // string. Those are worth nothing by construction, and saying so out loud
    // is better than silently treating them as real.
    const legacy = keccak256(toHex(`${label}-agent-key`));
    if (privateKeyToAccount(legacy).address.toLowerCase() === raw.agentKey.toLowerCase()) {
      console.warn(
        `  ! ${label} uses a publicly derivable demo key — anyone can compute it`,
      );
      agentPk = legacy;
    } else {
      throw new Error(
        `grants/${label}.json names ${raw.agentKey}, which this host cannot derive`,
      );
    }
  }

  return {
    name: `${label}.${tenant}.harness.eth`,
    registry: raw.registry,
    rootOfTree: raw.registry,
    agentPk,
    grant: {
      parent: "0x0000000000000000000000000000000000000000000000000000000000000000",
      label: raw.label,
      agentKey: raw.agentKey,
      start: Number(raw.start),
      end: Number(raw.end),
      salt: 0n,
      calls: [
        {
          target: USDC,
          selector: "0xa9059cbb",
          maxValue: 0n,
          checker: "0x0000000000000000000000000000000000000000",
          checkerCodeHash:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
        },
      ],
      spends: [
        { token: USDC, allowance: BigInt(raw.cap), unit: 2, multiplier: 1 },
      ],
    },
  };
}
