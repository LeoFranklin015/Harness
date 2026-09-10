import { createPublicClient, fallback, http, type PublicClient, type Transport } from "viem";
import { sepolia } from "viem/chains";

/**
 * One transport, several endpoints, so a bad minute on somebody's free RPC is
 * not a failed onboarding.
 *
 * Provisioning makes a dozen calls across a minute or two — reads, two writes,
 * a receipt wait — and a single dropped request used to end the whole flow with
 * a stack trace. Public endpoints rate-limit, time out and occasionally answer
 * 502, and none of that is interesting to the person watching.
 *
 * `fallback` moves to the next endpoint when one fails and ranks them by how
 * they have actually been behaving, so a degraded endpoint stops being asked.
 * Retries are per endpoint, with a delay, for the transient class specifically
 * — a revert is not retried, because a revert is an answer.
 */

/** Sepolia, in the order we would rather use them. `HARNESS_RPC` wins if set. */
const ENDPOINTS = [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://sepolia.drpc.org",
  "https://rpc.sepolia.org",
  "https://1rpc.io/sepolia",
];

export function sepoliaTransport(): Transport {
  const preferred = process.env.HARNESS_RPC ?? process.env.NEXT_PUBLIC_HARNESS_RPC;
  const urls = preferred ? [preferred, ...ENDPOINTS.filter((u) => u !== preferred)] : ENDPOINTS;

  // Ranking was measured costing more than it saved: it pings every endpoint
  // on a timer, and a public RPC that takes twenty seconds to answer a probe
  // holds a connection the whole time. Plain order-of-preference fallback
  // still moves off a broken endpoint, on the request that finds it broken.
  return fallback(
    urls.map((url) => http(url, { retryCount: 2, retryDelay: 400, timeout: 8_000 })),
  );
}


/**
 * One read-only client for the whole process.
 *
 * `sepoliaTransport` ranks its endpoints, which means a timer that pings all
 * four every thirty seconds for as long as the client exists. Built inside a
 * request handler that is polled every eight seconds, each request leaves a
 * timer behind that nothing ever stops — they accumulate until the event loop
 * is doing nothing but ranking RPC endpoints and ordinary requests start
 * taking twenty seconds. Which is exactly what happened.
 *
 * A client is stateless as far as callers are concerned, so there was never a
 * reason to make more than one.
 */
export const publicClient: PublicClient = createPublicClient({
  chain: sepolia,
  transport: sepoliaTransport(),
});
