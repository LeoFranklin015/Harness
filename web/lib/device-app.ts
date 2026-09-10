"use client";

import { filter, firstValueFrom, timeout } from "rxjs";
import {
  DeviceActionStatus,
  DeviceManagementKitBuilder,
  OpenAppDeviceAction,
  UserInteractionRequired,
  type DiscoveredDevice,
} from "@ledgerhq/device-management-kit";
import {
  webHidIdentifier,
  webHidTransportFactory,
} from "@ledgerhq/device-transport-kit-web-hid";

/**
 * The one way this app talks to a Ledger.
 *
 * Every device interaction — opening Ledger Sync for the ring, opening Ethereum
 * to sign — comes through here, on DMK. There is a second transport in the
 * codebase (`relay-client.ts` uses hw-transport-webhid) because LKRP's SDK
 * speaks that one, and the two cannot hold the HID handle at the same time. So
 * a session is a thing you open, use, and *release*; the browser only prompts
 * once per origin and device, so the handover is invisible.
 */

export type Step = (message: string) => void;

export type AppSession = {
  dmk: ReturnType<DeviceManagementKitBuilder["build"]>;
  sessionId: string;
  name: string;
  model: string;
  /** Give the HID handle back. Required before hw-transport can take it. */
  release: () => Promise<void>;
};

export function isSupported(): boolean {
  return typeof navigator !== "undefined" && "hid" in navigator;
}

/**
 * Connects and leaves `appName` running, keeping the session open.
 *
 * Switching apps makes the device re-enumerate over USB, which drops the
 * connection; DMK's session handling covers that, which is why this does not
 * hand-roll the BOLOS open-app APDU.
 *
 * Still driven by a click, but a click need not mean the picker. WebHID
 * permission is per origin and device and it persists, so a device already
 * granted can be reopened without asking again — otherwise switching from
 * Ledger Sync to Ethereum asks somebody to select a device they never
 * unplugged.
 *
 * The silent path is time-boxed. Permission is not the same as readiness: a
 * device re-enumerates when its app changes, and the entry can be stale. If
 * it does not come up in time the picker takes over, which is only what used
 * to happen every time.
 */
export async function openApp(appName: string, onStep: Step): Promise<AppSession> {
  if (!isSupported()) {
    throw new Error("This browser has no WebHID. Use Chrome, Edge or Brave to connect a Ledger.");
  }

  const dmk = new DeviceManagementKitBuilder().addTransport(webHidTransportFactory).build();

  const allowed = await permitted(dmk);
  if (allowed) {
    onStep("Reconnecting to your Ledger");
    const session = await attach(dmk, allowed, appName, onStep, RECONNECT_MS).catch(() => null);
    if (session) return session;
  }

  onStep("Select your Ledger in the browser prompt");
  const chosen = await firstValueFrom(dmk.startDiscovering({ transport: webHidIdentifier }));
  return attach(dmk, chosen, appName, onStep, null);
}

/** How long a device we believe we already have gets, before we ask again. */
const RECONNECT_MS = 12_000;

/**
 * A device this origin may open without prompting, if there is one.
 *
 * This only decides whether to *try* silently; whether it answers is settled
 * by actually connecting, under a deadline.
 */
async function permitted(
  dmk: ReturnType<DeviceManagementKitBuilder["build"]>,
): Promise<DiscoveredDevice | null> {
  try {
    const found = await firstValueFrom(
      dmk
        .listenToAvailableDevices({ transport: webHidIdentifier })
        .pipe(filter((all) => all.length > 0), timeout(2000)),
    );
    return found[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Connect, and leave `appName` running.
 *
 * `budget` bounds the attempt when we are guessing the device is still there.
 * Unbounded is the failure worth avoiding: a stale handle leaves the page
 * saying "confirm on your device" while the device has been asked nothing.
 */
async function attach(
  dmk: ReturnType<DeviceManagementKitBuilder["build"]>,
  device: DiscoveredDevice,
  appName: string,
  onStep: Step,
  budget: number | null,
): Promise<AppSession> {
  const expire = budget
    ? new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("the device did not answer in time")), budget),
      )
    : null;
  const within = <T,>(work: Promise<T>) =>
    expire ? (Promise.race([work, expire]) as Promise<T>) : work;

  const sessionId = await within(
    dmk.connect({ device, sessionRefresherOptions: { isRefresherDisabled: false } }),
  );

  const release = async () => {
    await dmk.disconnect({ sessionId }).catch(() => {});
  };

  try {
    onStep(`Open ${appName} on your device`);
    await within(
      runDeviceAction(
        dmk.executeDeviceAction({
          sessionId,
          deviceAction: new OpenAppDeviceAction({ input: { appName } }),
        }),
        onStep,
        appName,
      ),
    );
  } catch (err) {
    await release();
    throw err;
  }

  return {
    dmk,
    sessionId,
    name: device.name ?? "Ledger",
    model: String(device.deviceModel?.model ?? "Ledger"),
    release,
  };
}

export type ConnectedDevice = { name: string; model: string };

/**
 * Opens `appName` and immediately lets go of the device.
 *
 * For the ring: LKRP checks the running app by name and refuses anything else
 * but never opens it, so something has to — and then hw-transport needs the
 * handle, so this does not keep it.
 */
export async function connectAndOpenApp(appName: string, onStep: Step): Promise<ConnectedDevice> {
  const s = await openApp(appName, onStep);
  await s.release();
  return { name: s.name, model: s.model };
}

/**
 * Drives one device action to its end.
 *
 * `Pending` carries what the device is waiting for, and the person cannot see
 * the device and the screen at once — so every wait is named rather than left
 * as a spinner. A refusal is not an error: someone declining on the device is
 * the system working, and it is reported as its own outcome.
 */
export async function runDeviceAction(
  action: { observable: any },
  onStep: Step,
  appName = "the app",
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
              onStep(`Confirm opening ${appName} on the device`);
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
            reject(describe(state.error, appName));
            break;
        }
      },
      error: (err: unknown) => {
        sub.unsubscribe();
        reject(describe(err, appName));
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

export function describe(error: unknown, appName: string): Error {
  const tag = (error as { _tag?: string; name?: string })?._tag ?? (error as Error)?.name ?? "";
  const raw = `${tag} ${(error as Error)?.message ?? ""} ${JSON.stringify(error ?? {})}`;

  if (/Refused|5501|6985|refus/i.test(raw)) return new RejectedOnDevice();
  if (/NoAccessibleDevice|No selected device|requestDevice|user gesture|activation/i.test(raw)) {
    // WebHID only opens the device picker inside a click. Reached from the tail
    // of an async chain it is refused, and the transport reports it as no
    // device being accessible — which is true, but not why.
    return new Error("The browser needs a click to reach the device again. Press Continue.");
  }
  if (/blind/i.test(raw)) {
    // Our contracts have no clear-signing descriptor yet, so the device can
    // only sign these calls blind — and it refuses unless told it may.
    return new Error("Enable Blind signing in the Ethereum app's settings on the device, then try again.");
  }
  if (/not.?found|no such app|not installed|6807|6a82/i.test(raw)) {
    return new Error(`${appName} is not installed on this Ledger. Install it from Ledger Live, then try again.`);
  }
  if (/locked|5515/i.test(raw)) return new Error("The Ledger is locked. Enter your PIN and try again.");
  if (/denied|permission/i.test(raw)) {
    return new Error("The browser denied access to the device. Click connect and allow it.");
  }
  return new Error(`Lost contact with the device while using ${appName}. Reconnect it and try again.`);
}
