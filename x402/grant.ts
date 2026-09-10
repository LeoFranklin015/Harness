// Loading a Grant back.
//
// A Grant lives on-chain only as a hash, so anyone who needs to act under one
// has to resupply the struct byte for byte — timestamps included. That is what
// makes issuing cheap, and it is why the issuer writes every Grant it signs
// into `grants/`: the chain will not hand it back.

import { readFileSync } from "node:fs";
import { keccak256, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
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
  const raw = JSON.parse(
    readFileSync(new URL(`./grants/${label}.json`, import.meta.url), "utf8"),
  );

  // Demo keys are derived from a public string, so they are reproducible and
  // deliberately worth nothing. A real Agent Key is generated on the host that
  // runs the Agent and never leaves it.
  const agentPk = keccak256(toHex(`${label}-agent-key`));
  const derived = privateKeyToAccount(agentPk).address;
  if (derived.toLowerCase() !== raw.agentKey.toLowerCase()) {
    throw new Error(
      `grants/${label}.json names ${raw.agentKey}, but the seed derives ${derived}`,
    );
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
