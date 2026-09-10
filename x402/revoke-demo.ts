// What revocation does to an Agent that is mid-transaction.
//
// The Agent pays, and before it can spend what it paid for, the device revokes
// it. Two things then stop, in two different places, from one write:
//
//   the seller refuses the redemption, because the Agent's name no longer
//   resolves — and the seller checks ENS, not us
//
//   the registry refuses the next settlement, because the Agent has no
//   authority to spend under
//
// Neither was told about the other. Both are reading the same fact.

import { formatUnits, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { normalize } from "viem/ens";
import { readFileSync } from "node:fs";
import {
  UNIVERSAL_RESOLVER,
  USDC,
  publicClient,
  wallet,
} from "./harness.ts";
import { load } from "./grant.ts";
import { settle, transferCall } from "./settle.ts";

const SELLER = process.env.SELLER ?? "http://127.0.0.1:4021";
/**
 * A burner that pays gas and nothing else.
 *
 * Deliberately not the Tenant's key. An Agent that held that could call
 * `transfer` on the token directly and empty the account, never touching the
 * registry — the ceiling would be decorative. This key holds no authority: the
 * worst an Agent can do with it is waste its own gas.
 */
const RELAYER_PK = process.env.RELAYER_PK as Hex;
if (!RELAYER_PK) throw new Error("set RELAYER_PK — a burner with gas, never the Tenant's key");
const LABEL = process.argv[2] ?? "courier";

const { grant, registry, rootOfTree, agentPk, name } = load(LABEL);
const agentId = JSON.parse(
  readFileSync(new URL(`./grants/${LABEL}.json`, import.meta.url), "utf8"),
).agentId as Hex;

const REDEEM_TYPES = {
  Redemption: [
    { name: "txHash", type: "bytes32" },
    { name: "resource", type: "string" },
    { name: "payTo", type: "address" },
    { name: "amount", type: "uint256" },
  ],
} as const;
const DOMAIN = { name: "x402-harness", version: "1", chainId: 11155111 } as const;

const agent = privateKeyToAccount(agentPk);

async function ensKey() {
  try {
    return await publicClient.getEnsAddress({
      name: normalize(name),
      universalResolverAddress: UNIVERSAL_RESOLVER,
    });
  } catch {
    return null;
  }
}

console.log(`agent ${name}`);
console.log(`  ENS says its key is ${await ensKey()}\n`);

// 1. Pay for something, and hold the receipt.
const terms = (await (await fetch(`${SELLER}/research?q=pre-revoke`)).json())
  .accepts[0];
const amount = BigInt(terms.amount);
const txHash = await settle({
  registry,
  rootOfTree,
  grant,
  agentPk,
  relayerPk: RELAYER_PK,
  calls: [transferCall(USDC, terms.payTo, amount)],
});
console.log(`paid ${formatUnits(amount, 6)} USDC — ${txHash}`);

const signature = await agent.signTypedData({
  domain: DOMAIN,
  types: REDEEM_TYPES,
  primaryType: "Redemption",
  message: { txHash, resource: terms.resource, payTo: terms.payTo, amount },
});
const header = Buffer.from(
  JSON.stringify({
    x402Version: 2,
    scheme: terms.scheme,
    network: terms.network,
    payload: { agent: name, txHash, signature },
  }),
).toString("base64");

// 2. The device revokes. One transaction.
console.log(`\nrevoking ${name} …`);
const device = wallet(RELAYER_PK);
const hash = await device.writeContract({
  address: registry,
  abi: [
    {
      type: "function",
      name: "revoke",
      stateMutability: "nonpayable",
      inputs: [{ type: "bytes32" }],
      outputs: [],
    },
  ],
  functionName: "revoke",
  args: [agentId],
  chain: device.chain,
  account: device.account,
});
await publicClient.waitForTransactionReceipt({ hash });
console.log(`revoked in ${hash}`);
console.log(`  ENS now says its key is ${await ensKey()}\n`);

// 3. The receipt it already paid for no longer buys anything.
const res = await fetch(`${SELLER}/research?q=pre-revoke`, {
  headers: { "X-PAYMENT": header },
});
const body = await res.json();
console.log(`redeeming the payment it already made → ${res.status}`);
console.log(`  ${body.error ?? JSON.stringify(body)}`);

// 4. And it cannot pay again.
try {
  await settle({
    registry,
    rootOfTree,
    grant,
    agentPk,
    relayerPk: RELAYER_PK,
    calls: [transferCall(USDC, terms.payTo, amount)],
  });
  console.log("\nsettling again → SUCCEEDED (this should not happen)");
} catch {
  console.log(`\nsettling again → refused by the registry: no authority to spend`);
}
