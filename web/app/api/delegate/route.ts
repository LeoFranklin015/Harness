import { NextResponse } from "next/server";
import { createWalletClient, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { DELEGATE, delegateFrom } from "@/lib/delegation";
import { explain } from "@/lib/explain";
import { publicClient, sepoliaTransport } from "@/lib/rpc";
import { secret } from "@/lib/secrets";
import { BOX, forwardToBox } from "@/lib/box";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Carrying someone's account upgrade on chain for them.
 *
 * An EIP-7702 authorisation is a standalone signed object, not a transaction —
 * the account says "I permit myself to run this code" and anyone may put that
 * on chain. So the device signs the authorisation and this relays it, which
 * means the upgrade costs the person one tap and no gas at all.
 *
 * Nothing here can forge one. The authorisation is signed by the Ledger over
 * the chain id, the delegate address and the account's own nonce; change any of
 * them and it recovers to a different account and does nothing. The relayer's
 * only power is to publish it or not.
 */

// Shared, not per call: a ranked transport carries a timer, and one per
// request never stops. See `publicClient` in lib/rpc.
const pub = () => publicClient;

/** What the account runs today, and the nonce an authorisation must carry. */
export async function GET(request: Request) {
  // Pays the gas, so the key stays on one machine.
  if (BOX) return forwardToBox(request);

  const address = new URL(request.url).searchParams.get("address") as Address | null;
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "bad address" }, { status: 400 });
  }

  const client = pub();
  const [code, nonce] = await Promise.all([
    client.getCode({ address }),
    // The authorisation's nonce is the account's own, unchanged — the relayer
    // sends the transaction, so this account's nonce is not consumed first.
    client.getTransactionCount({ address, blockTag: "pending" }),
  ]);

  const delegate = delegateFrom(code as Hex | undefined);
  return NextResponse.json({
    nonce,
    delegate,
    upgraded: delegate?.toLowerCase() === DELEGATE.toLowerCase(),
    target: DELEGATE,
  });
}

export async function POST(request: Request) {
  // Pays the gas, so the key stays on one machine.
  if (BOX) return forwardToBox(request);

  const body = (await request.json()) as {
    address: Address;
    nonce: number;
    r: Hex;
    s: Hex;
    yParity: number;
  };

  if (!/^0x[0-9a-fA-F]{40}$/.test(body.address ?? "")) {
    return NextResponse.json({ error: "bad address" }, { status: 400 });
  }

  try {
    const relayer = privateKeyToAccount(secret("PRIVATE_KEY") as Hex);
    const client = pub();
    const wallet = createWalletClient({ account: relayer, chain: sepolia, transport: sepoliaTransport() });

    const hash = await wallet.sendTransaction({
      authorizationList: [
        {
          address: DELEGATE,
          chainId: sepolia.id,
          nonce: body.nonce,
          r: body.r,
          s: body.s,
          yParity: body.yParity,
        },
      ],
      // The transaction has to go somewhere; the account itself with no data is
      // the quietest choice. The authorisation is applied before execution, so
      // the upgrade lands whatever this call does.
      to: body.address,
      value: BigInt(0),
    });

    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      return NextResponse.json({ error: `upgrade reverted: ${hash}` }, { status: 502 });
    }

    // Say what actually happened rather than what was intended: a malformed
    // authorisation is simply ignored by the protocol, and the transaction
    // still succeeds.
    const delegate = delegateFrom((await client.getCode({ address: body.address })) as Hex | undefined);
    if (delegate?.toLowerCase() !== DELEGATE.toLowerCase()) {
      return NextResponse.json(
        { error: "the authorisation was not accepted — it may have been signed for a different account or nonce" },
        { status: 422 },
      );
    }

    return NextResponse.json({ hash, delegate });
  } catch (err) {
    return NextResponse.json({ error: explain(err) }, { status: 500 });
  }
}
