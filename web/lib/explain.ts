/**
 * Turning a library's shout into a sentence.
 *
 * viem's errors are excellent for a developer and terrible for the person
 * watching a machine get made: a revert arrives as several hundred characters
 * of ABI, args and a documentation link. Shown in a status line that reads as
 * "something broke, probably permanently", when usually it means "the RPC had a
 * bad second, press it again".
 *
 * So each known failure becomes one sentence that says what happened and
 * whether trying again is worth it. Anything unrecognised keeps its first line,
 * which is the part that ever carries meaning.
 */
export function explain(error: unknown): string {
  const raw = error instanceof Error ? `${error.name} ${error.message}` : String(error);

  // The revert reason, when the contract gave one. It is the truest thing in
  // the whole error and it is buried in the middle.
  const reason = raw.match(/execution reverted:?\s*([^\n"]{3,120})/i)?.[1]?.trim();

  if (/exceeds allowance/i.test(raw)) {
    return "The executor is not allowed to draw that much from your account yet — the approval step has not landed.";
  }
  if (/insufficient funds/i.test(raw)) {
    return "Not enough Sepolia ETH to pay for gas.";
  }
  if (/transfer amount exceeds balance/i.test(raw)) {
    return "Not enough USDC in your account to fund the agent.";
  }
  if (/nonce|already known|replacement transaction/i.test(raw)) {
    return "Two transactions collided. Try again in a moment.";
  }
  if (/gapped-nonce/i.test(raw)) {
    return "The network wants one transaction at a time from this account. Try again in a moment.";
  }
  if (/timeout|timed out|ETIMEDOUT|ECONNRESET|socket hang up|fetch failed|ENOTFOUND/i.test(raw)) {
    return "The Sepolia RPC did not answer. Nothing was lost — try again.";
  }
  if (/rate.?limit|429|too many requests/i.test(raw)) {
    return "The Sepolia RPC is rate-limiting us. Wait a few seconds and try again.";
  }
  if (/HttpRequestError|502|503|504/i.test(raw)) {
    return "The Sepolia RPC is having a bad moment. Nothing was lost — try again.";
  }
  if (reason) {
    return `The chain refused it: ${reason}`;
  }
  if (/reverted/i.test(raw)) {
    return "The chain refused the transaction. Nothing was charged beyond gas.";
  }

  // Unknown: the first line, minus viem's trailing essay.
  return raw.split("\n")[0]!.replace(/^\w*Error:?\s*/, "").trim() || "Something went wrong.";
}
