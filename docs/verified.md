# Verified facts

Checked directly, not taken from documentation or memory. Each line records how, so it can
be re-run rather than re-argued. Everything is Ethereum Sepolia (`0xaa36a7` / 11155111)
unless stated. Checked 2026-09-05.

## Ledger tooling

**`wallet-cli` runs on this host.** `@ledgerhq/wallet-cli@2.1.0` ships a prebuilt
`@ledgerhq/wallet-cli-linux-arm64` binary (162 MB); `npm i` took 16s on Oracle Linux 9
aarch64 with no compilation. `ring keys` executes and fails only with *"Ledger Key Ring not
initialized"*. There is no node-gyp/libusb build problem on ARM64.

**`ring` does not generate keys.** From its own `--help`: *"Encrypt data with a key from
your Ledger Key Ring."* We generate each Agent Key ourselves and hand the private half to
`ring encrypt`. `ring keys` lists `--key` namespaces, not keypairs.

**`ring init` is device-only.** *"Set up this machine as a Ledger Key Ring member, creating
or recovering a trustchain (device required)."* Flags are `--name`,
`--unsecure-no-password`, `--output`. No USB-less enrolment flag exists.

**A member is a keypair, and an existing member can add another in software.**
`SDK.addMember` builds a `SoftwareDevice` from the caller's own credentials — no
`hwDeviceProvider`. `removeMember` takes a `deviceId` and uses `withHw`. **Add is software;
remove is hardware.** The capability is in `@ledgerhq/ledger-key-ring-protocol`; wallet-cli
just doesn't surface it. `applicationId` is 17 for wallet-cli's stream.

**Removing a member rotates the key and destroys all prior ciphertext.** Adding does not.

**USB-less enrolment works, proven end to end (2026-09-05).** `ring init` on a MacBook with
a Nano Gen5 attached; `tools/lkrp-add-member.mjs` run on that Mac added this Oracle Cloud
aarch64 VM as member #2 (`members: 1 → 2`) with no device involved; the VM then decrypted a
ciphertext produced on the Mac. Only a public key crossed the wire. Root ID
`00e8b30e…4863d`, `applicationPath` `m/0'/17'/0'` — the `17` is wallet-cli's applicationId
appearing in the derivation path.

**Keychain on a headless Linux host: `keyring-rs` selects the kernel keyring
(linux-keyutils), not Secret Service.** `secret-tool` fails with *"The name is not
activatable"* because nothing serves `org.freedesktop.secrets`. The kernel path works, but a
revoked session keyring surfaces as `Couldn't access platform storage: KeyRevoked` — run
under `keyctl session -` to get a fresh one. Kernel keyrings do not survive a reboot, so
`tools/ring-persist.mjs` keeps the member key on disk in wallet-cli's own wrapped form and
re-injects it at startup. Nothing plaintext touches the disk.

**Stored member-credential format** (undocumented anywhere):
`"ENC:" + hex(iv‖aes256gcm(privkey_hex)‖tag) + "\n" + pubkey`, wrapped with PBKDF2-SHA256,
600,000 rounds, 16-byte salt from `session.yaml`. On macOS, `security find-generic-password
-w` prints this hex-encoded because the value contains a newline — the stored value itself
is the plain string.

**`session.yaml` is single-line flow YAML**, not block YAML:
`{accounts: [],trustchain: {rootId: …,applicationPath: "m/0'/17'/0'"},domains: […],passwordSalt: …}`.

**Four packaging defects in `@ledgerhq/ledger-key-ring-protocol`**, all reproducible:
`@ledgerhq/speculos-transport` depends on `@ledgerhq/live-dmk-speculos`, which was never
published, so every version 404s on install (workaround: a local stub via npm `overrides`);
the `lib-es` build uses extensionless relative imports and cannot be `import`ed by Node
(workaround: `createRequire` onto `lib/index.js`); and in `hw-ledger-key-ring-protocol`,
`Permissions.REMOVE_MEMBER: 0x16`, `CHANGE_MEMBER_PERMISSIONS: 0x32`, `CHANGE_MEMBER_NAME:
0x64` are decimal 16/32/64 written as hex, so they collide with the lower flag bits.

**State layout:** `$XDG_STATE_HOME/ledger-wallet-cli/session.yaml` (`memberCredentials`,
`jwt`, `accessToken`, `applicationPath`); member private key in the OS keychain via
`keyring-rs`; backend `https://trustchain.api.live.ledger.com`. Both
`dbus-secret-service` and `linux-keyutils` are referenced in the binary.

## ENSv2

**Sepolia, live** (`eth_getCode` non-zero on all):

| RootRegistry | `0x8115186e8f2e0b0281e86ab91f0f48ba90364354` |
| ETHRegistrar | `0xa88553f454b77203b0d036a05c894d555eaaa2cc` |
| BatchRegistrar | `0x8b16d15f3e51074d0e06f3cf4a0053f7cb92a7fb` |
| ENSV2Resolver | `0x508cb4e4596429ca98a1bb3112d88d18f92456b5` |
| ManagedUniversalResolverProxy | `0x6d80F2172CFdEc5730fE683860C33d26fC42e6F1` |
| UniversalResolver stable proxy | `0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe` |

**ETHRegistry `0xbdc85dd5b15d7ecb354cd7cb6f2c50b4f2c4f0e2`**, derived from the chain rather
than a docs table: `RootRegistry.getSubregistry("eth")` (`0x35af6216`) returns it.

**`platform.eth` is available.** `getExpiry` (`0x13c72608`, taking a labelhash) returns 0 for
`platform` and 0 for `ensign`, against 2068-03-07 for `vitalik`. Expiry is the reliable
availability signal — `available(string)` does not exist on the ETHRegistrar and reverts for
every label including registered ones. Note `ensign` returning 0 confirms the ENSv2
deployment was replaced: a name registered against the May tag no longer exists.

**Resolve the Universal Resolver at runtime; do not pin an implementation address.** Two
research passes returned different `UniversalResolverV2` addresses — both were live
implementations, superseded at different times. viem ≥ 2.35.0 already carries the stable
proxy in its `sepolia` chain definition.

**`contracts-v2` HEAD when pinned:** `48b3e2d39513b9dd32ef1850877a29009bc807b9`
(2026-07-03, "Post Audit Changes (#301)").

**Resource ids are not stable.** `PermissionedRegistry.sol:636-641` returns
`LibLabel.withVersion(anyId, _isExpired(entry.expiry) ? entry.eacVersionId + 1 : entry.eacVersionId)`,
and `unregister()` (198-209) does `++entry.eacVersionId` **and** sets
`expiry = block.timestamp`. The key therefore changes on unregister *and* on expiry with no
transaction at all. See ADR 0001.

**`renew()` has no parent-expiry bound** — only `if (newExpiry < expiry) revert
CannotReduceExpiry`.

**Registration is paid in stablecoins**, not ETH. MockUSDC
`0x768f42455a2d082e23ceef7d51e5787c82d67a39`, MockDAI
`0x5472c5725a00b7ba11f0794a79d08ade6f4683bd`, plus Circle USDC below.

## USDC and x402

**Circle USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`** — `name`/`symbol` `USDC`,
`decimals` 6, **`version()` returns `"2"`**. Implementation read from the
`org.zeppelinos.proxy.implementation` slot (the EIP-1967 slot is zero):
`0xda317c1d3e835dd5f1be459006471acaa1289068`.

**EIP-1271 is NOT available on this deployment.** Three independent signals: `version()` is
`"2"`, not `"2.2"` (Circle added EIP-1271 in FiatTokenV2_2); `0x1626ba7e`
(`isValidSignature`) is absent from the implementation bytecode; and a live `eth_call` to
the `bytes`-signature overload reverts `ECRecover: invalid signature` — the overload exists
but unpacks to ECDSA recovery. **A contract cannot be the EIP-3009 payer here.** This is a
fact about *this* deployment; re-check `version()` before repeating it about any other.

**`facilitator.x402.rs` supports Sepolia.** `/supported` lists
`{"x402Version":2,"scheme":"exact","network":"eip155:11155111","extra":{"extensions":["eip2612GasSponsoring"]}}`.
**Coinbase's facilitator does not** — its only EVM testnet is `eip155:84532` (Base Sepolia).

**The chosen facilitator has two open reliability issues**, both unresolved:
[#26](https://github.com/x402-rs/x402-rs/issues/26) *"TransferWithAuthorization frequently
reverts 'FiatTokenV2: invalid signature' in x402-rs; succeeds with x402 official
facilitator"* and [#42](https://github.com/x402-rs/x402-rs/issues/42) *"x402.rs/verify fails
where x402.org works."* Repo last pushed 2026-07-13. **Self-hosting is the same codebase and
mitigates neither.** This is the single most likely cause of a failed demo; test a real
settlement early and keep the direct-`transferFrom` fallback ready.

**No third-party payable endpoints exist on Ethereum Sepolia.** Coinbase's discovery index
returns zero results for `eip155:11155111` across ~3,000 indexed resources; all 32 indexed
testnet endpoints are Base Sepolia.

## Tailscale

**Sharing cannot carry this product.** Recipients must be an Owner/Admin/IT admin *of their
own tailnet*; shares strip tags; share recipients do not inherit split DNS; and only human
users can accept a share.

**User invites are the onboarding path, and they are automatable.**
`POST /api/v2/tailnet/{tailnet}/user-invites` takes a JSON array of `{role, email}` and
either emails the invite or returns an `inviteUrl`. The recipient signs in with any identity
provider, installs the client, and joins as a member — **inheriting the tailnet's split
DNS**, which no other flow does. No requirement that they administer a tailnet of their own.

The live OpenAPI spec is at `https://api.tailscale.com/api/v2?outputOpenapiSchema=true`
(YAML; every `openapi.json` guess 404s), and docs pages serve raw Markdown by appending
`.md`. The spec self-describes as unstable even though the endpoints are stable.

**That endpoint cannot be called with an OAuth client** — *"Only permitted for user-owned
keys, because invites require an inviting user"* — and no OAuth scope covers it. It needs a
personal API access token, capped at 90 days. Device-invite creation carries the same
prohibition. So the platform holds two credentials: a user token for invites, an OAuth
client for auth keys and eviction.

Pending invites are free; acceptance consumes a seat. `role` is settable at invite time,
group is not. An invitee already a non-admin member of another org's tailnet is blocked by
that tailnet's "Join external tailnets" default.

**Revocation is `DELETE /api/v2/device/{id}`** — the only call the docs promise takes effect
*"immediately"* — **plus deleting the device's auth key**, or the sandbox re-registers.
`expire` is not an alternative: key expiry is disabled by default on tagged devices.

**Automation uses an OAuth client**, not an API key (those cap at 90 days, unscoped). Scopes
`auth_keys`, `devices:core`, `devices:core:read`; `devices:core` requires tags on the
credential.

**Free-tier ceilings:** 50 tagged resources, 3 ACL groups, 6 users, 1,000 ephemeral
minutes/month. A node alive 4+ hours stops counting as ephemeral.

**Node identity is the state file.** Persist `/var/lib/tailscale` and a restart keeps the
same address; a name collision produces `agent1-1` and **that suffix never reverts**.

## Ledger device support

**Nano Gen5 is codename Apex** (`DeviceModelId.apex`, SDK target `apex_p`). `app-ethereum`
**≥ 1.19.0** or it will not run on a Gen5 at all; **use ≥ 1.22.3**, which fixes two EIP-7702
bugs (chain-ID-less authorizations accepted on all chains; review tricked into signing with
a different key than displayed).

**The EIP-7702 delegate allowlist has exactly one production entry** —
`Simple7702Account` at `0x4Cd241E8d1510e30b2076397afc7508Ae59C66c9`, `chain_id = 0`, live
on Sepolia (3638 bytes). No blind-signing escape. Test entries require an
`EIP7702_TEST_WHITELIST=1` build, i.e. Speculos only.

**`wallet-cli` cannot sign EIP-712 or EIP-7702.** Its groups are `account, assets, balances,
earn, genuine-check, operations, receive, ring, send, session, skill, swap`. Signing uses
`@ledgerhq/device-signer-kit-ethereum` directly. **Two separate Ledger integrations.**

**Custom clear-signing is testable pre-merge** via the ERC-7730 Tester at
`app.devicesdk.ledger.com/clear-signing-tools`, against real hardware. The registry PR has
no published SLA and EIP-712 is named the slowest review category — keep it off the critical
path.

## Deadline

**ETHOnline 2026 closes Sunday 13 September 2026, 12:00 EDT.** Demo video must be 2–4
minutes or it is rejected at upload. At most 3 partner prizes; a sponsor's multiple tracks
count as one. Ledger requires a DX feedback document and weights it as heavily as the code.
Large single commits or missing history may be disqualified.

## Still unverified

- Whether an established SSH session drops when its Tailscale device is deleted, or only
  fails at next handshake. The docs say "immediately" without a bound.
- Which keychain backend `keyring-rs` selects on a headless host, and whether the write path
  works there. The kernel-keyutils backend does not survive a reboot.
- Whether `ssh` over `.eth` resolves on macOS 15.7.3. Expected to work — the bogus-TLD
  interception is a macOS 26 change — but `dig` succeeding proves nothing, so test `ping`
  and `ssh`.
- Whether a real x402 settlement succeeds on Sepolia through `facilitator.x402.rs`, given
  the two open issues above.
