"use client";

import { SignerEthBuilder } from "@ledgerhq/device-signer-kit-ethereum";
import {
  createPublicClient,
  hexToBytes,
  http,
  padHex,
  serializeTransaction,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { sepolia } from "viem/chains";
import { openApp, runDeviceAction, type Step } from "./device-app";

export { isSupported, RejectedOnDevice, type Step } from "./device-app";

/**
 * The Ethereum side of the device: an address, and signatures.
 *
 * Built on `openApp` rather than owning a connection of its own — there is one
 * way to reach the Ledger in this app, and this is a layer over it, not a
 * second one.
 */

const RPC = "https://ethereum-sepolia-rpc.publicnode.com";

/** Where the Tenant's authority lives. Fixed, not user input. */
export const DEVICE_PATH = "44'/60'/0'/0/0";

export type Device = {
  /** The address that will be `rootDevice` on this Tenant's registry. */
  address: Address;
  /** BIP-44 path the address came from. Never guessed, never normalised. */
  path: string;
  model: string;
  /**
   * Signs a transaction on the device and broadcasts it.
   *
   * The device is the only signer for anything inside a Tenant's registry —
   * there is no server key that could do this on its behalf, which is the
   * whole point. Every wait is named through `onStep`, because the person is
   * looking at the device, not the screen.
   */
  send: (tx: { to: Address; data: Hex; value?: bigint }, onStep: Step) => Promise<TransactionReceipt>;
  /** Give the device back — needed before the ring's transport can take it. */
  disconnect: () => Promise<void>;
};

/** Opens the Ethereum app and reads the address that will hold authority. */
export async function connect(onStep: Step): Promise<Device> {
  const session = await openApp("Ethereum", onStep);
  const { dmk, sessionId } = session;

  try {
    onStep("Reading the account that will hold authority");
    const signer = new SignerEthBuilder({ dmk, sessionId, originToken: "harness" }).build();
    const { observable } = signer.getAddress(DEVICE_PATH, { checkOnDevice: false });
    const out = (await runDeviceAction({ observable }, onStep, "Ethereum")) as { address: string };
    const address = out.address as Address;
    const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });

    return {
      address,
      path: DEVICE_PATH,
      model: session.model,

      send: async (tx, step) => {
        step("Preparing the transaction");
        const [nonce, fees, gas] = await Promise.all([
          pub.getTransactionCount({ address, blockTag: "pending" }),
          pub.estimateFeesPerGas(),
          pub.estimateGas({ account: address, to: tx.to, data: tx.data, value: tx.value ?? BigInt(0) }),
        ]);

        const unsigned = {
          chainId: sepolia.id,
          type: "eip1559" as const,
          to: tx.to,
          data: tx.data,
          value: tx.value ?? BigInt(0),
          nonce,
          // A fifth over the estimate: a clone's first write to a fresh slot
          // costs more than the estimate against current state suggests.
          gas: gas + gas / BigInt(5),
          maxFeePerGas: fees.maxFeePerGas,
          maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
        };

        // The device signs the serialised transaction bytes — it parses and
        // shows them itself, so what it displays is what is broadcast.
        step("Review and approve on your Ledger");
        const { observable: signing } = signer.signTransaction(
          DEVICE_PATH,
          hexToBytes(serializeTransaction(unsigned)),
        );
        const sig = (await runDeviceAction({ observable: signing }, step, "Ethereum")) as {
          r: string;
          s: string;
          v: number;
        };

        const hex = (x: string) => padHex((x.startsWith("0x") ? x : `0x${x}`) as Hex, { size: 32 });
        const yParity = sig.v >= 27 ? sig.v - 27 : sig.v;
        const signed = serializeTransaction(unsigned, { r: hex(sig.r), s: hex(sig.s), yParity });

        step("Broadcasting");
        const hash = await pub.sendRawTransaction({ serializedTransaction: signed });
        step("Waiting for confirmation");
        const receipt = await pub.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
        return receipt;
      },

      disconnect: session.release,
    };
  } catch (err) {
    await session.release();
    throw err;
  }
}
