// An x402 seller speaking the standard `exact` scheme.
//
// No part of this knows what a Grant is. It asks for an EIP-3009 authorization,
// checks it, and settles it by putting it on chain itself — which is what a
// facilitator would otherwise do. Any x402 buyer can pay it.
//
// It does one non-standard thing, and only as an extra: if the payer's address
// resolves to an Agent name it recognises, it says so. Refusing on that basis
// would be wrong here — the money is the payer's own by the time it signs.
//
//   node --experimental-strip-types seller-exact.ts

import { createServer } from "node:http";
import {
  formatUnits,
  getAddress,
  recoverAddress,
  type Address,
  type Hex,
} from "viem";
import { USDC, publicClient, wallet } from "./harness.ts";
import {
  USDC_3009_ABI,
  authorizationDigest,
  fromWire,
} from "./exact.ts";

const PORT = Number(process.env.PORT ?? 4022);
const PAY_TO = getAddress(
  process.env.PAY_TO ?? "0x000000000000000000000000000000000000dEaD",
);
const PRICE = 250_000n;
const NETWORK = "eip155:11155111";

/** What this resource costs, in the shape `PaymentRequirementsV2Schema` wants. */
function requirements() {
  return {
    scheme: "exact",
    network: NETWORK,
    amount: PRICE.toString(),
    asset: USDC,
    payTo: PAY_TO,
    maxTimeoutSeconds: 120,
    // The client needs these to build the EIP-712 domain for the token.
    extra: { name: "USDC", version: "2" },
  };
}
/**
 * A real, third-party facilitator that supports this network.
 *
 * Setting `FACILITATOR=self` falls back to settling in-process, which needs gas
 * and a key. Using the remote one is the more honest test: it verifies and
 * settles our Agent's payment with none of our code involved, and it will
 * refuse anything malformed.
 */
const FACILITATOR = process.env.FACILITATOR ?? "https://facilitator.x402.rs";
const FACILITATOR_PK = process.env.PRIVATE_KEY as Hex;

type Verdict = { ok: true; tx: Hex } | { ok: false; why: string };

async function settlePayment(payment: any, resource: string): Promise<Verdict> {
  if (payment?.x402Version !== 2) return { ok: false, why: "not an x402 v2 payload" };

  // `accepted` is the client echoing back which of our terms it chose. It is
  // client-supplied, so it is checked against what we actually offered — a
  // payload that quotes itself a lower price must not be able to buy anything.
  const accepted = payment.accepted;
  const ours = requirements();
  if (accepted?.scheme !== ours.scheme) return { ok: false, why: `unknown scheme ${accepted?.scheme}` };
  if (accepted?.network !== ours.network) return { ok: false, why: "wrong network" };
  if (accepted?.amount !== ours.amount) return { ok: false, why: "quoted a different price" };
  if (!accepted?.asset || getAddress(accepted.asset) !== getAddress(ours.asset)) {
    return { ok: false, why: "wrong asset" };
  }
  if (!accepted?.payTo || getAddress(accepted.payTo) !== PAY_TO) {
    return { ok: false, why: "wrong recipient" };
  }

  const { signature, authorization } = payment.payload ?? {};
  if (!signature || !authorization) return { ok: false, why: "incomplete payload" };

  const auth = fromWire(authorization);

  // Terms first — an authorization is only worth checking if it is for us.
  if (getAddress(auth.to) !== PAY_TO) return { ok: false, why: "wrong recipient" };
  if (auth.value < PRICE) {
    return { ok: false, why: `offered ${formatUnits(auth.value, 6)}, wanted ${formatUnits(PRICE, 6)}` };
  }
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (now < auth.validAfter) return { ok: false, why: "authorization is not valid yet" };
  if (now >= auth.validBefore) return { ok: false, why: "authorization has expired" };

  // The signature must recover to `from` — this token has no EIP-1271 path, so
  // the payer is always a plain account that holds the funds.
  const signer = await recoverAddress({ hash: authorizationDigest(auth), signature });
  if (getAddress(signer) !== getAddress(auth.from)) {
    return { ok: false, why: "signature does not match `from`" };
  }

  // Nonces are per-authorizer and single-use, enforced by the token itself.
  const used = await publicClient.readContract({
    address: USDC,
    abi: USDC_3009_ABI,
    functionName: "authorizationState",
    args: [auth.from, auth.nonce],
  });
  if (used) return { ok: false, why: "authorization already used" };

  const balance = await publicClient.readContract({
    address: USDC,
    abi: USDC_3009_ABI,
    functionName: "balanceOf",
    args: [auth.from],
  });
  if (balance < auth.value) {
    return { ok: false, why: `payer holds ${formatUnits(balance, 6)}, needs ${formatUnits(auth.value, 6)}` };
  }

  // Hand it to the facilitator, which verifies and settles it. This is the part
  // that proves the payment is standard: a service that has never heard of us
  // takes it, checks it, and puts it on chain.
  if (FACILITATOR !== "self") {
    const body = {
      x402Version: 2,
      paymentPayload: payment,
      paymentRequirements: ours,
    };
    const verify = await fetch(`${FACILITATOR}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const verdict = await verify.json();
    if (!verdict.isValid) {
      return { ok: false, why: `facilitator rejected it: ${verdict.invalidReason ?? verdict.invalidMessage}` };
    }
    console.log(`  facilitator verified, payer ${verdict.payer}`);

    const settled = await fetch(`${FACILITATOR}/settle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await settled.json();
    if (!result.success) {
      return { ok: false, why: `facilitator could not settle it: ${result.errorReason ?? result.errorMessage}` };
    }
    return { ok: true, tx: result.transaction as Hex };
  }

  // Settle it ourselves. The buyer never sends a transaction either way.
  const { r, s, v } = {
    r: `0x${signature.slice(2, 66)}` as Hex,
    s: `0x${signature.slice(66, 130)}` as Hex,
    v: Number.parseInt(signature.slice(130, 132), 16),
  };
  const facilitator = wallet(FACILITATOR_PK);
  const hash = await facilitator.writeContract({
    address: USDC,
    abi: USDC_3009_ABI,
    functionName: "transferWithAuthorization",
    args: [auth.from, auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce, v, r, s],
    chain: facilitator.chain,
    account: facilitator.account,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") return { ok: false, why: `settlement reverted: ${hash}` };
  return { ok: true, tx: hash };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const send = (code: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(code, { "content-type": "application/json", ...headers });
    res.end(JSON.stringify(body, null, 2));
  };

  if (url.pathname !== "/research") return send(404, { error: "no such resource" });

  // v2 carries the payment in PAYMENT-SIGNATURE; v1 used X-PAYMENT. Accept both
  // so a v1 client is not turned away for being old.
  const header = req.headers["payment-signature"] ?? req.headers["x-payment"];
  if (!header) {
    // PaymentRequiredV2: `resource` is a top-level object and the entries in
    // `accepts` carry only payment terms. V1 put the resource inside each entry.
    const required = {
      x402Version: 2,
      error: "payment is required",
      resource: {
        url: `http://127.0.0.1:${PORT}${url.pathname}`,
        description: "One research query",
        mimeType: "application/json",
      },
      accepts: [requirements()],
    };

    // v2 sends this in a header, not the body. The body is v1's channel, and a
    // v2 client does not read it — it throws "Invalid payment required
    // response" before it ever looks at the terms.
    return send(402, required, {
      "payment-required": Buffer.from(JSON.stringify(required)).toString("base64"),
    });
  }

  let payment: any;
  try {
    payment = JSON.parse(Buffer.from(String(header), "base64").toString("utf8"));
  } catch {
    return send(400, { error: "payment header is not base64 JSON" });
  }

  const verdict = await settlePayment(payment, url.pathname);
  if (!verdict.ok) {
    console.log(`  ✗ refused: ${verdict.why}`);
    return send(402, { x402Version: 2, error: verdict.why });
  }

  console.log(`  ✓ settled ${verdict.tx} from ${payment.payload.authorization.from}`);
  send(
    200,
    { query: url.searchParams.get("q") ?? "", answer: "42", settledIn: verdict.tx },
    {
      // v2 reads PAYMENT-RESPONSE; X-PAYMENT-RESPONSE is v1's name for it.
      "payment-response": Buffer.from(
        JSON.stringify({ success: true, transaction: verdict.tx, network: NETWORK }),
      ).toString("base64"),
    },
  );
});

server.listen(PORT, () =>
  console.log(
    `x402 seller on :${PORT} — standard \`exact\` scheme\n` +
      `  ${formatUnits(PRICE, 6)} USDC per call to ${PAY_TO}\n` +
      `  settling via ${FACILITATOR}\n`,
  ),
);
