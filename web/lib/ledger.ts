"use client";

import { firstValueFrom } from "rxjs";
import { SignerEthBuilder } from "@ledgerhq/device-signer-kit-ethereum";
import {
  createPublicClient,
  hexToBytes,
  padHex,
  serializeTransaction,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { sepolia } from "viem/chains";
import { batchCalldata, DELEGATE, type BatchCall } from "./delegation";
import { sepoliaTransport } from "./rpc";
import { openApp, runDeviceAction, type Step } from "./device-app";

export { isSupported, RejectedOnDevice, type Step } from "./device-app";

/**
 * The Ethereum side of the device: an address, and signatures.
 *
 * Built on `openApp` rather than owning a connection of its own — there is one
 * way to reach the Ledger in this app, and this is a layer over it, not a
 * second one.
 */

/** Where the Tenant's authority lives. Fixed, not user input. */
export const DEVICE_PATH = "44'/60'/0'/0/0";

export type Device = {
  /** The address that will be `rootDevice` on this Tenant's registry. */
  address: Address;
  /** BIP-44 path the address came from. Never guessed, never normalised. */
  path: string;
  model: string;
  /** The Ethereum app's version, which decides whether it knows the delegate. */
  appVersion: string | null;
  /**
   * Signs a transaction on the device and broadcasts it.
   *
   * The device is the only signer for anything inside a Tenant's registry —
   * there is no server key that could do this on its behalf, which is the
   * whole point. Every wait is named through `onStep`, because the person is
   * looking at the device, not the screen.
   */
  send: (tx: { to: Address; data: Hex; value?: bigint }, onStep: Step) => Promise<TransactionReceipt>;
  /**
   * Several calls, one signature.
   *
   * Only works once the account carries `Simple7702Account`, because an
   * ordinary account can do one thing per transaction. The transaction goes to
   * the account itself, so every call inside it is made *by* the Tenant and the
   * contracts see exactly what they would have seen one at a time.
   */
  sendBatch: (calls: BatchCall[], onStep: Step) => Promise<TransactionReceipt>;
  /**
   * Signs permission for this account to run `Simple7702Account`.
   *
   * Just the authorisation, not a transaction: it is a standalone signed object
   * that anyone may carry on chain. Our relayer does, so this costs the person
   * one tap and no gas. `nonce` is the account's current nonce, because the
   * sender will be someone else.
   */
  authorize: (nonce: number, onStep: Step) => Promise<{ r: Hex; s: Hex; yParity: number }>;
  /** Give the device back — needed before the ring's transport can take it. */
  disconnect: () => Promise<void>;
};

const pad = (x: string) => padHex((x.startsWith("0x") ? x : `0x${x}`) as Hex, { size: 32 });

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
    const pub = createPublicClient({ chain: sepolia, transport: sepoliaTransport() });

    // The whitelist that decides whether a delegation can be signed at all
    // lives in the app, so its version is the thing to ask about. Not knowing
    // is survivable: an app too old refuses on its own, and says so.
    let appVersion: string | null = null;
    try {
      const state = await firstValueFrom(dmk.getDeviceSessionState({ sessionId }));
      appVersion = (state as { currentApp?: { version?: string } }).currentApp?.version ?? null;
    } catch {
      appVersion = null;
    }

    async function send(
      tx: { to: Address; data: Hex; value?: bigint },
      step: Step,
    ): Promise<TransactionReceipt> {
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

      const yParity = sig.v >= 27 ? sig.v - 27 : sig.v;
      const signed = serializeTransaction(unsigned, { r: pad(sig.r), s: pad(sig.s), yParity });

      step("Broadcasting");
      const hash = await pub.sendRawTransaction({ serializedTransaction: signed });
      step("Waiting for confirmation");
      const receipt = await pub.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
      return receipt;
    }

    return {
      address,
      path: DEVICE_PATH,
      model: session.model,
      appVersion,

      send,

      sendBatch: (calls, step) => {
        if (calls.length === 0) throw new Error("nothing to batch");
        return send({ to: address, data: batchCalldata(calls) }, step);
      },

      authorize: async (nonce, step) => {
        step("Approve the account upgrade on your Ledger");
        const { observable: auth } = signer.signDelegationAuthorization(
          DEVICE_PATH,
          sepolia.id,
          DELEGATE,
          nonce,
        );
        const sig = (await runDeviceAction({ observable: auth }, step, "Ethereum")) as {
          r: string;
          s: string;
          v: number;
        };
        return { r: pad(sig.r), s: pad(sig.s), yParity: sig.v >= 27 ? sig.v - 27 : sig.v };
      },

      disconnect: session.release,
    };
  } catch (err) {
    await session.release();
    throw err;
  }
}
