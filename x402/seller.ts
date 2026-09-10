// An x402 seller that checks its buyer is still allowed to buy.
//
// The interesting part is not the paywall, it is what the seller verifies. A
// payment carries the Agent's ENS name; the seller resolves that name at the
// moment of redemption and refuses if it does not answer. So authority is
// checked by the counterparty, live, using nothing but a standard ENS lookup —
// the seller runs no code of ours and trusts nothing we told it earlier.
//
//   node --experimental-strip-types seller.ts

import { createServer } from "node:http";
import {
  formatUnits,
  getAddress,
  hashTypedData,
  recoverAddress,
  type Address,
  type Hex,
} from "viem";
import { normalize } from "viem/ens";
import { USDC, UNIVERSAL_RESOLVER, publicClient } from "./harness.ts";

const PORT = Number(process.env.PORT ?? 4021);
const PAY_TO = getAddress(
  process.env.PAY_TO ?? "0x000000000000000000000000000000000000dEaD",
);
/** 0.25 USDC a call. */
const PRICE = 250_000n;
const NETWORK = "eip155:11155111";

/**
 * Our own x402 scheme.
 *
 * The standard `exact` scheme wants an EIP-3009 `transferWithAuthorization`
 * signed by whoever holds the funds. An Agent cannot produce one: the funds are
 * the Tenant's, the Agent holds no key over them, and Sepolia USDC does not
 * implement EIP-1271 — so a contract signature is not an option either. That is
 * not a gap to work around, it is the design: an Agent that could sign for the
 * Tenant's balance directly would have no ceiling.
 *
 * So the Agent pays through the registry that bounds it, and presents the
 * settlement. The scheme field is what x402 has for exactly this.
 */
const SCHEME = "harness-settled";

/** A redemption is signed, so a settlement seen on-chain cannot be stolen. */
const REDEEM_TYPES = {
  Redemption: [
    { name: "txHash", type: "bytes32" },
    { name: "resource", type: "string" },
    { name: "payTo", type: "address" },
    { name: "amount", type: "uint256" },
  ],
} as const;

const DOMAIN = { name: "x402-harness", version: "1", chainId: 11155111 } as const;

/** Settlements already spent. One transaction buys one thing. */
const redeemed = new Set<string>();

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

type Verdict = { ok: true } | { ok: false; why: string };

async function verify(payment: any, resource: string): Promise<Verdict> {
  if (payment?.scheme !== SCHEME) return { ok: false, why: `unknown scheme ${payment?.scheme}` };
  if (payment?.network !== NETWORK) return { ok: false, why: `wrong network` };

  const { agent, txHash, signature } = payment.payload ?? {};
  if (!agent || !txHash || !signature) return { ok: false, why: "incomplete payload" };

  // 1. Is this Agent still allowed to act? Ask ENS, not us.
  //
  // A revoked Agent has no address to resolve to — not because a record was
  // deleted, but because the answer is computed from its authority and the
  // answer became no.
  let agentKey: Address | null = null;
  try {
    agentKey = await publicClient.getEnsAddress({
      name: normalize(agent),
      universalResolverAddress: UNIVERSAL_RESOLVER,
    });
  } catch {
    return { ok: false, why: `${agent} does not resolve` };
  }
  if (!agentKey || agentKey === "0x0000000000000000000000000000000000000000") {
    return { ok: false, why: `${agent} has no key — revoked, expired, or unknown` };
  }

  // 2. Did that Agent authorise this redemption? Otherwise anyone who watched
  //    the chain could present someone else's settlement as their own.
  const digest = hashTypedData({
    domain: DOMAIN,
    types: REDEEM_TYPES,
    primaryType: "Redemption",
    message: { txHash, resource, payTo: PAY_TO, amount: PRICE },
  });
  const signer = await recoverAddress({ hash: digest, signature });
  if (getAddress(signer) !== getAddress(agentKey)) {
    return { ok: false, why: "redemption not signed by the Agent that ENS names" };
  }

  // 3. One settlement, one purchase.
  if (redeemed.has(txHash.toLowerCase())) {
    return { ok: false, why: "this settlement was already spent" };
  }

  // 4. Did the money actually arrive? Read the transfer out of the receipt
  //    rather than believing the payload.
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash as Hex });
  if (receipt.status !== "success") return { ok: false, why: "settlement reverted" };

  const paid = receipt.logs
    .filter(
      (l) =>
        getAddress(l.address) === getAddress(USDC) &&
        l.topics[0] === TRANSFER_TOPIC &&
        l.topics[2] &&
        getAddress(("0x" + l.topics[2].slice(26)) as Address) === PAY_TO,
    )
    .reduce((sum, l) => sum + BigInt(l.data), 0n);

  if (paid < PRICE) {
    return { ok: false, why: `paid ${formatUnits(paid, 6)}, wanted ${formatUnits(PRICE, 6)}` };
  }

  redeemed.add(txHash.toLowerCase());
  return { ok: true };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const resource = url.pathname;
  const send = (code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body, null, 2));
  };

  if (resource !== "/research") return send(404, { error: "no such resource" });

  const header = req.headers["x-payment"];
  if (!header) {
    return send(402, {
      x402Version: 2,
      error: "X-PAYMENT header is required",
      accepts: [
        {
          scheme: SCHEME,
          network: NETWORK,
          resource,
          description: "One research query",
          mimeType: "application/json",
          payTo: PAY_TO,
          amount: PRICE.toString(),
          maxTimeoutSeconds: 120,
          asset: USDC,
          extra: { name: "USDC", version: "2" },
        },
      ],
    });
  }

  let payment: any;
  try {
    payment = JSON.parse(Buffer.from(String(header), "base64").toString("utf8"));
  } catch {
    return send(400, { error: "X-PAYMENT is not base64 JSON" });
  }

  const verdict = await verify(payment, resource);
  if (!verdict.ok) {
    console.log(`  ✗ refused: ${verdict.why}`);
    return send(402, { x402Version: 2, error: verdict.why });
  }

  console.log(`  ✓ paid by ${payment.payload.agent} — ${payment.payload.txHash}`);
  send(200, {
    query: url.searchParams.get("q") ?? "",
    answer: "42",
    servedTo: payment.payload.agent,
    settledIn: payment.payload.txHash,
  });
});

server.listen(PORT, () =>
  console.log(
    `x402 seller on :${PORT}\n  ${formatUnits(PRICE, 6)} USDC per call, paid to ${PAY_TO}\n  buyers are checked against ENS at redemption\n`,
  ),
);
