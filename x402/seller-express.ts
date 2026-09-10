// The seller, built entirely out of x402's own parts.
//
// `@x402/express`'s `paymentMiddlewareFromConfig` puts up the paywall, and
// `HTTPFacilitatorClient` points at a public facilitator that verifies and
// settles. There is no x402 code here at all — only a price, an address, and a
// route handler that runs once the payment has gone through.
//
// This is the other half of the interop claim. `agent-exact.ts` proves our
// buyer is standard by paying with their client; this proves the seller is,
// by not being ours.
//
//   node --experimental-strip-types seller-express.ts

import { HTTPFacilitatorClient } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddlewareFromConfig } from "@x402/express";
import express from "express";
import { USDC } from "./harness.ts";

const PORT = Number(process.env.PORT ?? 4023);
const PAY_TO = process.env.PAY_TO ?? "0x000000000000000000000000000000000000dEaD";
const NETWORK = "eip155:11155111";
const FACILITATOR = process.env.FACILITATOR ?? "https://facilitator.x402.rs";

const app = express();

app.use(
  paymentMiddlewareFromConfig(
    {
      "GET /research": {
        accepts: [
          {
            scheme: "exact",
            network: NETWORK,
            payTo: PAY_TO,
            // Atomic units of the asset named in `extra`, not dollars.
            price: { asset: USDC, amount: "250000", extra: { name: "USDC", version: "2" } },
            maxTimeoutSeconds: 120,
          },
        ],
        description: "One research query",
        mimeType: "application/json",
      },
    },
    new HTTPFacilitatorClient({ url: FACILITATOR }),
    // The server side of the scheme: it shapes the 402 and knows what a valid
    // `exact` payload looks like. Verification and settlement still happen at
    // the facilitator.
    [{ network: NETWORK, server: new ExactEvmScheme() }],
  ),
);

app.get("/research", (req, res) => {
  console.log(`  ✓ paid — serving ${req.originalUrl}`);
  res.json({ query: String(req.query.q ?? ""), answer: "42" });
});

app.listen(PORT, () =>
  console.log(
    `x402 seller on :${PORT} — @x402/express + ${FACILITATOR}\n` +
      `  0.25 USDC per call to ${PAY_TO}\n` +
      `  no x402 code of ours in this process\n`,
  ),
);
