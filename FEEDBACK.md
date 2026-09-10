# Developer experience feedback — Ledger Agent Stack

Found while building on the Ledger Key Ring. Versions: `@ledgerhq/wallet-cli@2.1.0`,
`@ledgerhq/ledger-key-ring-protocol@0.15.2`, `@ledgerhq/hw-ledger-key-ring-protocol@0.10.7`,
`@ledgerhq/device-management-kit@1.9.0`. Nano Gen5 and Flex, macOS 15.7.3 and Oracle Linux 9
aarch64.

---

## 1. `@ledgerhq/ledger-key-ring-protocol` does not install from npm

```
npm error 404  '@ledgerhq/live-dmk-speculos@0.10.0' is not in this registry.
```

`@ledgerhq/speculos-transport` depends on `@ledgerhq/live-dmk-speculos`, which has never been
published — `npm view @ledgerhq/live-dmk-speculos versions` 404s. Every version in the line
is affected; 0.13.0 fails identically on `0.8.5`.

**Fix:** publish it, or make `speculos-transport` an optional dependency. Nothing on the
hardware path needs it.

**Workaround:** a stub package plus an npm `overrides` entry.

---

## 2. The ESM build cannot be imported by Node

`lib-es/index.js` emits extensionless relative imports:

```js
import { HWDeviceProvider } from "./HWDeviceProvider";
```

```
ERR_MODULE_NOT_FOUND: Cannot find module '.../lib-es/HWDeviceProvider'
```

Bundlers tolerate this, so it only fails outside one — which is where a CLI or agent runs.

**Fix:** emit `.js` extensions in the ESM build.

**Workaround:** `createRequire` onto `lib/index.js`.

---

## 3. `ring destroy` leaves the application permanently unusable

`wallet-cli ring destroy` reports *"application deactivated (Ledger Key Ring kept for other
apps)"* and writes a `CloseStream` command into the application stream. Every subsequent
`getOrCreateTrustchain` then fails:

```
Ledger device: UNKNOWN_ERROR (0xb00c)
```

`sdk.ts` resolves the path with `getApplicationRootPath(this.context.applicationId)`, and
`getApplicationRootPath(applicationId, increment = 0)` returns the **highest existing** index
— the stream that was just closed. `pushMember` replays the blocks, the replay reaches the
`CloseStream` block, and `app-ledger-sync` answers `SW_STREAM_CLOSED`. There is no `isClosed`
check anywhere in 0.15.2 or hw 0.10.7. The same file's `removeMember` already passes
`increment = 1`; `getOrCreateTrustchain` does not.

A documented command therefore renders the Key Ring permanently unusable from that
application, with no path back through any public API.

Fixed upstream in **ledger-live PR #18568**, which adds `ResolvedCommandStream.isClosed()`
and reopens on the next index — but that ships only on the `nightly` tag
(`0.16.0-nightly.20260707030641`, dated 7 July, unchanged since). `latest` is 0.15.2.

**Fix:** release 0.16.0. Until then, one line in `ring destroy --help` stating the
application cannot be reactivated.

**Workaround:** reimplement the upstream fix — take `getApplicationRootPath(applicationId, 1)`
and push the member onto the fresh index.

---

## 4. `0xb00c` is not in `StatusCodes`

`@ledgerhq/errors` maps `0xb007` (`SW_BAD_STATE`) and nothing else from the `0xB0xx` family,
so `SW_STREAM_CLOSED` surfaces as `UNKNOWN_ERROR (0xb00c)`. Its meaning exists only in
`LedgerHQ/app-ledger-sync/src/sw.h`; a GitHub-wide search for `0xb00c ledger` returns zero
results, and there is nothing on the developer portal.

**Fix:** add the `0xB009`–`0xB00F` Ledger Sync range to `StatusCodes`. Seven entries turn an
opaque code into a diagnosable error, and would have made item 3 self-evident.

---

## 5. `Permissions` flags overlap

`hw-ledger-key-ring-protocol/lib/CommandBlock.js`:

```js
REMOVE_MEMBER: 0x16, CHANGE_MEMBER_PERMISSIONS: 0x32, CHANGE_MEMBER_NAME: 0x64,
```

These are decimal 16, 32 and 64 written as hex. `0x16` is `0b00010110`, which overlaps
`KEY_CREATOR`, `KEY_REVOKER` and `ADD_MEMBER` instead of being a distinct bit. Presumably
intended as `0x10`, `0x20`, `0x40`.

Latent for callers using `OWNER`; silently wrong for anyone composing granular permissions.

---

## 6. On Linux the keychain is the kernel keyring, and it does not survive a reboot

With no Secret Service present, `keyring-rs` selects `linux-keyutils`. Kernel keyrings are not
persistent, so a service loses its member credentials on restart and `ring decrypt` fails with
*"Member credentials not found in the OS keychain. Run `wallet-cli ring destroy` then
`wallet-cli ring init` to reset."* — advice that, per item 3, makes the situation worse.

A revoked session keyring also reports `Couldn't access platform storage: KeyRevoked`, while
`secret-tool` fails separately with *"The name is not activatable"*, pointing at the wrong
cause.

This affects the VPS and CI-runner deployments the Key Ring is aimed at.

**Fix:** document the Linux backend selection and its reboot behaviour on the Key Ring CLI
page.

---

## What works well

- **Headless `encrypt`/`decrypt` after a single `ring init` is the right primitive** for
  agents. We encrypted on a laptop with the device attached and decrypted on a cloud VM with
  no USB port; only a public key crossed the wire.
- **`addMember` being software-signed while `removeMember` requires hardware** is a good
  asymmetry: growth is cheap, revocation is deliberate.
- **DMK type-checked first time** against 1.9.0 — `OpenAppDeviceAction`, the
  `DeviceActionState` machine and `UserInteractionRequired` all mapped straight onto UI with
  no guesswork.
- **The Key Ring bundles for the browser.** We drive it over WebHID from a Next.js app with
  nothing installed locally, which was not obvious from the docs and is worth documenting.
- **`app-ledger-sync` being open source** is the only reason item 3 was diagnosable.
