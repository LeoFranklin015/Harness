import { createRequire } from "node:module";
import {
  crypto as lkrpCrypto,
  DerivationPath,
  SoftwareDevice,
  type StreamTree,
} from "@ledgerhq/hw-ledger-key-ring-protocol";
import type {
  MemberCredentials,
  Trustchain,
} from "@ledgerhq/ledger-key-ring-protocol/lib/types";
import { RelayTransport } from "./relay";

// The package's ESM build uses extensionless relative imports, which Node's
// resolver rejects. Force the CJS build.
const require = createRequire(import.meta.url);
// getSdk lives in index.js; the credential converters in sdk.js. Requiring
// getSdk from sdk.js yields undefined, which surfaces only as a minified
// "not a function" at call time.
const { getSdk } = require("@ledgerhq/ledger-key-ring-protocol/lib/index.js") as {
  getSdk: (
    mock: boolean,
    ctx: { applicationId: number; name: string; apiBaseUrl: string },
    withDevice: unknown
  ) => SdkLike;
};
const { convertLiveCredentialsToKeyPair } =
  require("@ledgerhq/ledger-key-ring-protocol/lib/sdk.js") as {
    convertLiveCredentialsToKeyPair: (
      c: MemberCredentials
    ) => ConstructorParameters<typeof SoftwareDevice>[0];
  };

/** wallet-cli's application stream. Ledger Live uses a different one. */
export const APPLICATION_ID = 17;
const API = "https://trustchain.api.live.ledger.com";
const OWNER = 0xffffffff;

/**
 * SW_STREAM_CLOSED, from app-ledger-sync's sw.h. Raised when a block replay
 * reaches a CloseStream command — i.e. the application was deactivated, as
 * `wallet-cli ring destroy` does. @ledgerhq/errors maps only 0xb007 from that
 * family, so it arrives as UNKNOWN_ERROR.
 */
const SW_STREAM_CLOSED = 0xb00c;

const isStreamClosed = (e: unknown) =>
  (e as { statusCode?: number })?.statusCode === SW_STREAM_CLOSED ||
  /b00c/i.test(e instanceof Error ? e.message : String(e));

type SdkLike = {
  getOrCreateTrustchain(
    deviceId: string,
    credentials: MemberCredentials
  ): Promise<{ type: string; trustchain: Trustchain }>;
  getMembers(t: Trustchain, c: MemberCredentials): Promise<{ id: string; name: string }[]>;
  hwDeviceProvider: {
    withJwt<T>(id: string, job: (jwt: unknown) => Promise<T>, policy?: string): Promise<T>;
    withHw<T>(id: string, job: (hw: unknown) => Promise<T>): Promise<T>;
  };
  api: { getTrustchains(jwt: unknown): Promise<Record<string, Record<string, unknown>>> };
  fetchTrustchain(jwt: unknown, rootId: string): Promise<{ streamTree: StreamTree }>;
  pushMember(
    tree: StreamTree,
    path: string,
    rootId: string,
    withJwt: unknown,
    withDevice: unknown,
    member: { id: string; name: string; permissions: number }
  ): Promise<StreamTree>;
};

/**
 * Creates or restores the Tenant's ring and joins it as the broker.
 *
 * The broker is the caller, so `getOrCreateTrustchain` admits it directly —
 * there is no separate `addMember`, and the broker's key never leaves this
 * host. The device is reached through the relay: the browser holds the USB
 * handle and forwards bytes, nothing more.
 */
export async function joinRing(
  relaySessionId: string,
  memberName: string,
  credentials: MemberCredentials
): Promise<{ trustchain: Trustchain; outcome: string; members: number }> {
  const transport = new RelayTransport(relaySessionId);
  const withDevice = () => (job: (t: unknown) => unknown) => job(transport);

  const sdk = getSdk(
    false,
    { applicationId: APPLICATION_ID, name: memberName, apiBaseUrl: API },
    withDevice
  );

  let trustchain: Trustchain;
  let outcome: string;
  try {
    const result = await sdk.getOrCreateTrustchain("relay", credentials);
    trustchain = result.trustchain;
    outcome = result.type;
  } catch (e) {
    if (!isStreamClosed(e)) throw e;
    trustchain = await reopenApplicationStream(sdk, memberName, credentials);
    outcome = "reopened";
  }

  const members = await sdk.getMembers(trustchain, credentials);
  return { trustchain, outcome, members: members.length };
}

/**
 * Reopens an application stream that `ring destroy` closed.
 *
 * `getOrCreateTrustchain` resolves the path with `getApplicationRootPath(id)`,
 * whose increment defaults to 0 — the highest existing index, which is the
 * closed one. It then replays the blocks, the replay reaches the CloseStream
 * command, and the device answers SW_STREAM_CLOSED. Nothing in 0.15.2 checks
 * whether a stream is closed, so there is no supported way back.
 *
 * `removeMember` already asks for `increment = 1`. This does the same, giving
 * the application a fresh stream on the same trustchain. Ledger shipped the
 * equivalent fix in ledger-live PR #18568, which is only on the nightly tag.
 *
 * It reaches past the SDK's public surface; the alternative is a one-way door.
 */
async function reopenApplicationStream(
  sdk: SdkLike,
  memberName: string,
  credentials: MemberCredentials
): Promise<Trustchain> {
  const withJwt = <T,>(job: (jwt: unknown) => Promise<T>) =>
    sdk.hwDeviceProvider.withJwt("relay", job, "cache");
  const withHw = <T,>(job: (hw: unknown) => Promise<T>) =>
    sdk.hwDeviceProvider.withHw("relay", job);

  const trustchains = await withJwt((jwt) => sdk.api.getTrustchains(jwt));
  const rootId = Object.entries(trustchains).find(([, paths]) =>
    Object.keys(paths).includes("m/")
  )?.[0];
  if (!rootId) throw new Error("No ring found on this device.");

  const { streamTree } = await withJwt((jwt) => sdk.fetchTrustchain(jwt, rootId));
  const path = streamTree.getApplicationRootPath(APPLICATION_ID, 1);

  const reopened = await sdk.pushMember(streamTree, path, rootId, withJwt, withHw, {
    id: credentials.pubkey,
    name: memberName,
    permissions: OWNER,
  });

  // extractEncryptionKey is module-private in the SDK; this is the same steps.
  const device = new SoftwareDevice(convertLiveCredentialsToKeyPair(credentials));
  const key = await device.readKey(reopened, DerivationPath.toIndexArray(path));

  return {
    rootId,
    walletSyncEncryptionKey: lkrpCrypto.to_hex(key.slice(0, 32)),
    applicationPath: path,
  };
}
