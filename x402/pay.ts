// Paying somebody, directly, under the Grant.
//
// The narrow counterpart to `agent-exact.ts`. There is no seller, no 402, no
// scheme to negotiate — just a USDC transfer out of the Tenant's account to an
// address the Agent names. It exists because the interesting claim is not that
// we can speak x402; it is that the ceiling holds whatever the Agent asks for.
//
// The Agent has no key that can move this money on its own. It signs a batch;
// a burner relays it; the registry checks the Grant and measures the Tenant's
// balance before and after. Over the ceiling, the whole batch reverts — the
// transfer does not happen partially, and it does not happen at all.
//
//   node --experimental-strip-types pay.ts <label> <to> <amount> [tenant]
//   node --experimental-strip-types pay.ts runner 0xAbC…123 10

import { formatUnits, isAddress, parseUnits, type Address, type Hex } from "viem";
import { USDC } from "./harness.ts";
import { load } from "./grant.ts";
import { headroom } from "./headroom.ts";
import { settle, transferCall } from "./settle.ts";

const [LABEL, TO, AMOUNT, TENANT = "demo"] = process.argv.slice(2);

if (!LABEL || !TO || !AMOUNT) {
  console.error("usage: pay.ts <label> <to> <amount-usdc> [tenant]");
  process.exit(1);
}
if (!isAddress(TO)) throw new Error(`${TO} is not an address`);

const RELAYER_PK = process.env.RELAYER_PK as Hex;
if (!RELAYER_PK) throw new Error("set RELAYER_PK — a burner with gas, never the Tenant's key");

const amount = parseUnits(AMOUNT, 6);
const { grant, registry, rootOfTree, agentPk, name } = await load(LABEL, TENANT);

// Read the ceiling first, so a refusal is legible before it is a revert.
const before = await headroom(registry, rootOfTree, grant);
console.log(
  `${name}  cap ${formatUnits(before.cap, 6)}  spent ${formatUnits(before.spent, 6)}  ` +
    `left ${formatUnits(before.left, 6)}`,
);

if (amount > before.left) {
  console.log(
    `\nasking for ${AMOUNT} with ${formatUnits(before.left, 6)} left — the registry will revert.`,
  );
  console.log("this is the moment a person is asked. sending anyway, to show it.\n");
}

const tx = await settle({
  registry,
  rootOfTree,
  grant,
  agentPk,
  relayerPk: RELAYER_PK,
  calls: [transferCall(USDC, TO as Address, amount)],
});

console.log(`sent ${AMOUNT} USDC → ${TO}`);
console.log(`tx   https://sepolia.etherscan.io/tx/${tx}`);

const after = await headroom(registry, rootOfTree, grant);
console.log(`left ${formatUnits(after.left, 6)} of ${formatUnits(after.cap, 6)}`);
