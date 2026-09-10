import { fallback, http, type Transport } from "viem";

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

  return fallback(
    urls.map((url) => http(url, { retryCount: 2, retryDelay: 400, timeout: 20_000 })),
    { rank: { interval: 30_000, sampleCount: 3 } },
  );
}
