"use client";

import { firstValueFrom } from "rxjs";
import {
  DeviceActionStatus,
  DeviceManagementKitBuilder,
  OpenAppDeviceAction,
  UserInteractionRequired,
} from "@ledgerhq/device-management-kit";
import {
  webHidIdentifier,
  webHidTransportFactory,
} from "@ledgerhq/device-transport-kit-web-hid";
import { SignerEthBuilder } from "@ledgerhq/device-signer-kit-ethereum";

/**
 * The device, as the rest of the app needs it.
 *
 * One session, opened once and kept. A session is a transport connection, not
 * an authorisation, so it is held across operations rather than reopened —
 * reconnecting per action would make the browser re-enumerate the device and
 * cost a prompt every time.
 */

export type Device = {
  /** The address that will be `rootDevice` on this Tenant's registry. */
  address: `0x${string}`;
  /** BIP-44 path the address came from. Never guessed, never normalised. */
  path: string;
  model: string;
  disconnect: () => Promise<void>;
};

/** Where the Tenant's authority lives. Fixed, not user input. */
export const DEVICE_PATH = "44'/60'/0'/0/0";

export function isSupported(): boolean {
  return typeof navigator !== "undefined" && "hid" in navigator;
}

export type Step = (message: string) => void;

/**
 * Connects, opens the Ethereum app, and reads the address that will hold
 * authority.
 *
 * Must be called from a user gesture: WebHID's picker does not appear
 * otherwise, and it fails silently rather than throwing.
 */
export async function connect(onStep: Step): Promise<Device> {
  if (!isSupported()) {
    throw new Error(
      "This browser has no WebHID. Use Chrome, Edge or Brave to connect a Ledger.",
    );
  }

  const dmk = new DeviceManagementKitBuilder()
    .addTransport(webHidTransportFactory)
    .build();

  onStep("Select your Ledger in the browser prompt");
  const discovered = await firstValueFrom(
    dmk.startDiscovering({ transport: webHidIdentifier }),
  );

  const sessionId = await dmk.connect({
    device: discovered,
    sessionRefresherOptions: { isRefresherDisabled: false },
  });

  try {
    onStep("Open the Ethereum app on your device");
    await runDeviceAction(
      dmk.executeDeviceAction({
        sessionId,
        deviceAction: new OpenAppDeviceAction({ input: { appName: "Ethereum" } }),
      }),
      onStep,
    );

    onStep("Reading the account that will hold authority");
    const signer = new SignerEthBuilder({ dmk, sessionId, originToken: "harness" }).build();
    const { observable } = signer.getAddress(DEVICE_PATH, { checkOnDevice: false });
    const out = (await runDeviceAction({ observable }, onStep)) as { address: string };

    return {
      address: out.address as `0x${string}`,
      path: DEVICE_PATH,
      model: discovered.deviceModel?.model ?? "Ledger",
      disconnect: async () => {
        await dmk.disconnect({ sessionId }).catch(() => {});
      },
    };
  } catch (err) {
    await dmk.disconnect({ sessionId }).catch(() => {});
    throw err;
  }
}

/**
 * Drives one device action to its end.
 *
 * `Pending` carries what the device is waiting for, and the user cannot see the
 * device and the screen at once — so every wait is named rather than left as a
 * spinner. A refusal is not an error: someone declining on the device is the
 * system working, and it is reported as its own outcome.
 */
async function runDeviceAction(
  action: { observable: any },
  onStep: Step,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const sub = action.observable.subscribe({
      next: (state: any) => {
        switch (state.status) {
          case DeviceActionStatus.Pending: {
            const need = state.intermediateValue?.requiredUserInteraction;
            if (need === UserInteractionRequired.UnlockDevice) {
              onStep("Enter your PIN on the device");
            } else if (need === UserInteractionRequired.ConfirmOpenApp) {
              onStep("Confirm opening the app on the device");
            } else if (need && need !== UserInteractionRequired.None) {
              onStep("Check your device");
            }
            break;
          }
          case DeviceActionStatus.Completed:
            sub.unsubscribe();
            resolve(state.output);
            break;
          case DeviceActionStatus.Stopped:
            sub.unsubscribe();
            reject(new RejectedOnDevice());
            break;
          case DeviceActionStatus.Error:
            sub.unsubscribe();
            reject(classify(state.error));
            break;
        }
      },
      error: (err: unknown) => {
        sub.unsubscribe();
        reject(classify(err));
      },
    });
  });
}

/** Someone said no on the device. Not a failure — an answer. */
export class RejectedOnDevice extends Error {
  constructor() {
    super("Declined on the device.");
    this.name = "RejectedOnDevice";
  }
}

function classify(err: unknown): Error {
  const name = (err as { _tag?: string; name?: string })?._tag ?? (err as Error)?.name ?? "";
  const message = String((err as Error)?.message ?? err ?? "");

  if (/Refused|5501|6985/i.test(name + message)) return new RejectedOnDevice();
  if (/locked/i.test(message)) return new Error("The device is locked. Enter your PIN and try again.");
  if (/not installed|6a82|6807/i.test(name + message)) {
    return new Error("The Ethereum app is not installed. Install it from Ledger Live and try again.");
  }
  if (/denied|permission/i.test(message)) {
    return new Error("The browser denied access to the device. Click connect and allow it.");
  }
  return new Error("Lost contact with the device. Reconnect it and try again.");
}
