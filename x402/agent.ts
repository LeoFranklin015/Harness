// An Agent that buys until it is not allowed to any more.
//
// Nobody approves these purchases. The device set a ceiling once, and inside it
// the Agent runs unattended: it hits a paywall, settles, retries, gets its
// answer, and goes round again. What ends the run is not a decision — it is the
// registry refusing a settlement that would cross the line.
//
//   node --experimental-strip-types agent.ts [calls]

import { formatUnits, hashTypedData, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { USDC } from "./harness.ts";
import { load } from "./grant.ts";
import { headroom } from "./headroom.ts";
import { settle, transferCall } from "./settle.ts";

const SELLER = process.env.SELLER ?? "http://127.0.0.1:4021";
const LABEL = process.argv[2] ?? "research";
const ROUNDS = Number(process.argv[3] ?? 3);
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

const { grant, registry, rootOfTree, agentPk, name: NAME } = await load(LABEL);

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
const usd = (v: bigint) => `$${formatUnits(v, 6)}`;

async function buy(round: number) {
  // 1. Ask, and be told the price.
  const first = await fetch(`${SELLER}/research?q=round-${round}`);
  if (first.status !== 402) throw new Error(`expected 402, got ${first.status}`);
  const { accepts } = await first.json();
  const terms = accepts[0];
  const amount = BigInt(terms.amount);
  console.log(`  price ${usd(amount)} to ${terms.payTo}`);

  // 2. Settle through the registry. This is the step that can refuse.
  const txHash = await settle({
    registry,
    rootOfTree,
    grant,
    agentPk,
    relayerPk: RELAYER_PK,
    calls: [transferCall(USDC, terms.payTo, amount)],
  });
  console.log(`  settled ${txHash}`);

  // 3. Sign the redemption, so the settlement is ours to spend and no one
  //    else's to steal off the chain.
  const signature = await agent.signTypedData({
    domain: DOMAIN,
    types: REDEEM_TYPES,
    primaryType: "Redemption",
    message: { txHash, resource: terms.resource, payTo: terms.payTo, amount },
  });

  const payment = Buffer.from(
    JSON.stringify({
      x402Version: 2,
      scheme: terms.scheme,
      network: terms.network,
      payload: { agent: NAME, txHash, signature },
    }),
  ).toString("base64");

  // 4. Ask again, paying this time.
  const second = await fetch(`${SELLER}/research?q=round-${round}`, {
    headers: { "X-PAYMENT": payment },
  });
  const body = await second.json();
  if (second.status !== 200) throw new Error(`seller refused: ${body.error}`);
  console.log(`  served: ${JSON.stringify(body.answer)}`);
}

console.log(`agent ${NAME}\n  key ${agent.address}\n`);

for (let round = 1; round <= ROUNDS; round++) {
  const before = await headroom(registry, rootOfTree, grant);
  console.log(
    `round ${round}  headroom ${usd(before.left)} of ${usd(before.cap)} today`,
  );

  try {
    await buy(round);
  } catch (err) {
    const why = String((err as Error).message);
    // The registry names the reason. `OverSpendLimit` is not a failure of the
    // Agent — it is the ceiling doing its job, and nothing the Agent can retry
    // its way past.
    if (/OverSpendLimit|0x/.test(why) && /revert/i.test(why)) {
      const now = await headroom(registry, rootOfTree, grant);
      console.log(
        `\n  HALTED. ${usd(now.left)} left of ${usd(now.cap)}; this call needed more.`,
      );
      console.log(
        `  Nothing resumes until the device raises the ceiling or the window` +
          ` rolls at ${now.windowEnds?.toISOString()}.`,
      );
      process.exit(0);
    }
    throw err;
  }
  console.log();
}

const end = await headroom(registry, rootOfTree, grant);
console.log(`done. spent ${usd(end.spent)} of ${usd(end.cap)} today.`);
