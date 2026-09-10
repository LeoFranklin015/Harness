// An Agent paying a standard x402 seller, using the official x402 client.
//
// Nothing about the payment is ours. `@x402/core`'s `x402Client` reads the 402,
// picks a requirement, and `@x402/evm`'s `ExactEvmScheme` builds and signs the
// EIP-3009 authorization. Our only contribution is the signer it uses, and how
// that signer came to hold any money.
//
// That is the point. If the payment were shaped by our code, "works with any
// x402 seller" would be a claim. Built by their client, it is a property.
//
// The token settles by `ecrecover`, so the signer must be the account that
// holds the USDC — this USDC is FiatToken v2.1 with no `isValidSignature`, so
// there is no contract-signer path. The Agent therefore has to hold it, and the
// question becomes how it gets it: it asks the registry. Funding is itself a
// USDC transfer out of the Tenant's account, so it passes the same check every
// spend does — permitted call, live Agent, inside the daily cap. The ceiling
// has not been given up; it has moved from the moment of paying to the moment
// of being funded.
//
//   node --experimental-strip-types agent-exact.ts [label] [rounds]

import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { formatUnits, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { USDC, publicClient } from "./harness.ts";
import { USDC_3009_ABI } from "./exact.ts";
import { load } from "./grant.ts";
import { headroom } from "./headroom.ts";
import { settle, transferCall } from "./settle.ts";

const SELLER = process.env.SELLER ?? "http://127.0.0.1:4022";
const NETWORK = "eip155:11155111";
const LABEL = process.argv[2] ?? "research";
const ROUNDS = Number(process.argv[3] ?? 2);
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

const { grant, registry, rootOfTree, agentPk, name } = await load(LABEL);
const account = privateKeyToAccount(agentPk);
const usd = (v: bigint) => `$${formatUnits(v, 6)}`;

// The official client, with our Agent Key as its signer.
//
// Their client has spend controls of its own, and by default allows only assets
// it recognises — Sepolia USDC is not one. So it is named explicitly, with a
// per-payment cap. Two independent ceilings now apply: theirs, in the client,
// which the Agent could disable because it runs the client; and ours, in the
// registry, which it cannot.
const client = new x402Client()
  .register(NETWORK, new ExactEvmScheme(toClientEvmSigner(account)))
  .setSpendControls({
    allowedAssets: [
      { network: NETWORK, asset: USDC, maxAmountPerPayment: "1000000" },
    ],
  });
const http = new x402HTTPClient(client);

const held = () =>
  publicClient.readContract({
    address: USDC,
    abi: USDC_3009_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });

async function buy(round: number) {
  const url = `${SELLER}/research?q=round-${round}`;
  const first = await fetch(url);
  if (first.status !== 402) throw new Error(`expected 402, got ${first.status}`);

  // Their client parses the 402 — so it also validates that our seller's
  // response is a well-formed one.
  const required = http.getPaymentRequiredResponse((h) => first.headers.get(h));
  const terms = required.accepts[0];
  const amount = BigInt((terms as any).amount ?? (terms as any).maxAmountRequired);
  console.log(`  ${terms.scheme}/${terms.network}: ${usd(amount)} to ${terms.payTo}`);

  // Get funded, under the Grant. This is the step that can refuse.
  const balance = await held();
  if (balance < amount) {
    const tx = await settle({
      registry,
      rootOfTree,
      grant,
      agentPk,
      relayerPk: RELAYER_PK,
      calls: [transferCall(USDC, account.address, amount - balance)],
    });
    console.log(`  funded ${usd(amount - balance)} under the Grant — ${tx}`);
  }

  // Their client signs the authorization and encodes the header.
  const payload = await client.createPaymentPayload(required);
  const headers = http.encodePaymentSignatureHeader(payload);

  const second = await fetch(url, { headers });
  const body = await second.json();
  if (second.status !== 200) throw new Error(`seller refused: ${body.error ?? second.status}`);

  // The receipt rides in a header, not the body — so it works the same whoever
  // wrote the seller.
  const receipt = http.getPaymentSettleResponse((h) => second.headers.get(h));
  console.log(`  served: ${JSON.stringify(body.answer)}`);
  console.log(`  settled ${receipt.transaction} on ${receipt.network}`);
}

console.log(`agent ${name}\n  key ${account.address}\n  paying with @x402/core + @x402/evm\n`);

for (let round = 1; round <= ROUNDS; round++) {
  const h = await headroom(registry, rootOfTree, grant);
  console.log(
    `round ${round}  headroom ${usd(h.left)} of ${usd(h.cap)}  holding ${usd(await held())}`,
  );
  try {
    await buy(round);
  } catch (err) {
    const why = String((err as Error).message);
    if (/revert/i.test(why)) {
      const now = await headroom(registry, rootOfTree, grant);
      console.log(`\n  HALTED. ${usd(now.left)} left of ${usd(now.cap)}; cannot be funded.`);
      console.log(`  The ceiling refused the funding, so there is nothing to pay with.`);
      process.exit(0);
    }
    throw err;
  }
  console.log();
}

console.log(`done. holding ${usd(await held())} — funded one payment at a time.`);
