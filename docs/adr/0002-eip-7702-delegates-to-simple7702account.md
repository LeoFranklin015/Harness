# EIP-7702 delegates to Simple7702Account; policy logic lives elsewhere

The obvious design is for the parent's 7702-delegated account to *be* the policy engine —
its own contract code validating a child's signature against live Policy before allowing
an Action. **A Ledger will not sign that delegation.** We delegate to the one whitelisted
implementation and keep policy in a separate contract.

## Why

`app-ethereum` ships a hardcoded delegate allowlist. On `develop`,
`src/features/sign_authorization_eip7702/whitelist_7702.c` contains exactly one production
entry:

```c
{.chain_id = 0, .name = "Simple7702Account",
 .address = 0x4Cd241E8d1510e30b2076397afc7508Ae59C66c9}
```

`chain_id = 0` means all chains. Any other delegate is refused with
`ui_error_no_7702_whitelist` / `COMMAND_NOT_ALLOWED`, and **there is no blind-signing
escape hatch for 7702**. Uniswap Calibur, MetaMask Gator, Ambire and Alchemy were each
added during 2025–26 and removed again; the PR restoring the EF-recognised set is still
open. Test whitelist entries exist only under a custom build with
`EIP7702_TEST_WHITELIST=1` — Speculos or a dev build, never a retail device.

Delegating to `Simple7702Account` does not rescue the original design either: it is the
eth-infinitism ERC-4337 reference account and executes what the EOA key authorises. Our
hierarchical check is not in it and cannot be added, so every Agent Action would require
the root key — a device tap per payment, which is precisely what the product exists to
eliminate.

## What 7702 is for instead

Atomic batched grants. One device tap executes approve + register + resolver-write as a
single transaction from the Owner's own address. That is a real use of the primitive, it
is within the allowlist, and it improves the human's experience rather than pretending to
enforce anything.

## Consequences

- Forking `app-ethereum` to whitelist our own delegate was considered and rejected: it
  means sideloading an unsigned device app, which is a materially worse story than using
  the device as intended.
- The "smart account upgrade" / EIP-7702 setting must be manually enabled in the app or
  every authorization fails.
- Pin `app-ethereum >= 1.22.3`. Below 1.19.0 the app will not run on a Nano Gen5 at all,
  and 1.22.3 fixes two 7702 bugs: chain-ID-less authorizations accepted on all chains, and
  review being tricked into signing with a different key than displayed.
