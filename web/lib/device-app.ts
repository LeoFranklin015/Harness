"use client";

import { firstValueFrom } from "rxjs";
import {
  DeviceManagementKitBuilder,
  DeviceActionStatus,
  OpenAppDeviceAction,
  UserInteractionRequired,
} from "@ledgerhq/device-management-kit";
import {
  webHidIdentifier,
  webHidTransportFactory,
} from "@ledgerhq/device-transport-kit-web-hid";

export type ConnectedDevice = {
  name: string;
  model: string;
};

/**
 * Connects to the Ledger and leaves the named app running.
 *
 * LKRP checks the running app by name and refuses anything else, but never
 * opens it — so something has to. Switching apps makes the device re-enumerate
 * over USB, which drops the connection; DMK's session handling covers that,
 * which is why this does not hand-roll the BOLOS open-app APDU.
 *
 * DMK and hw-transport cannot hold the HID device at the same time, so this
 * releases it before returning. The browser only prompts once per origin and
 * device, so a later handover is invisible.
 *
 * Must be called from a user gesture: the WebHID picker will not appear
 * otherwise, and it fails silently rather than throwing.
 */
export async function connectAndOpenApp(
  appName: string,
  onStep: (message: string) => void
): Promise<ConnectedDevice> {
  if (!isSupported()) {
    throw new Error(
      "This browser has no WebHID. Use Chrome, Edge or Brave to connect a Ledger."
    );
  }

  const dmk = new DeviceManagementKitBuilder()
    .addTransport(webHidTransportFactory)
    .build();

  onStep("Select your Ledger in the browser prompt");
  const device = await firstValueFrom(
    dmk.startDiscovering({ transport: webHidIdentifier })
  );

  const sessionId = await dmk.connect({ device });

  try {
    onStep(`Opening ${appName}…`);
    const { observable } = dmk.executeDeviceAction({
      sessionId,
      deviceAction: new OpenAppDeviceAction({ input: { appName } }),
    });

    await new Promise<void>((resolve, reject) => {
      const sub = observable.subscribe({
        next: (state) => {
          switch (state.status) {
            case DeviceActionStatus.Pending: {
              const need = state.intermediateValue?.requiredUserInteraction;
              if (need === UserInteractionRequired.ConfirmOpenApp) {
                onStep(`Confirm opening ${appName} on the device`);
              } else if (need === UserInteractionRequired.UnlockDevice) {
                onStep("Unlock your Ledger with its PIN");
              }
              break;
            }
            case DeviceActionStatus.Completed:
              sub.unsubscribe();
              resolve();
              break;
            case DeviceActionStatus.Stopped:
              sub.unsubscribe();
              reject(new Error("Cancelled on the device."));
              break;
            case DeviceActionStatus.Error:
              sub.unsubscribe();
              reject(describe(state.error, appName));
              break;
          }
        },
        error: (e) => reject(e),
      });
    });

    return {
      name: device.name ?? "Ledger",
      model: String(device.deviceModel?.model ?? ""),
    };
  } finally {
    // Release the HID handle so hw-transport can take it later.
    await dmk.disconnect({ sessionId }).catch(() => {});
  }
}

export function isSupported(): boolean {
  return typeof navigator !== "undefined" && "hid" in navigator;
}

function describe(error: unknown, appName: string): Error {
  const raw = JSON.stringify(error ?? {});
  if (/not.?found|no such app|6807|6a82/i.test(raw)) {
    return new Error(
      `${appName} is not installed on this Ledger. Install it from Ledger Live, then try again.`
    );
  }
  if (/locked|5515/i.test(raw)) {
    return new Error("The Ledger is locked. Enter your PIN and try again.");
  }
  if (/5501|6985|refus/i.test(raw)) {
    return new Error("Cancelled on the device.");
  }
  return new Error(`Could not open ${appName} on the device.`);
}
