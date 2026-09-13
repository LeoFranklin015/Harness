# ENS, in this repository

Where each part of ENS is used.

## The registries

Our own registry on the ENSv2 contracts. Each tenant's registry roots its own
subtree: `harness.eth` holds `acme.harness.eth`, and acme's registry holds
`runner.acme.harness.eth`.

- [`contracts/src/PlatformRegistry.sol`](contracts/src/PlatformRegistry.sol) — the root, minting a subtree per tenant
- [`contracts/src/AgentRegistry.sol`](contracts/src/AgentRegistry.sol) — a tenant's own registry, on `PermissionedRegistry`
- [`contracts/src/GrantLib.sol`](contracts/src/GrantLib.sol) — the grant, hashed rather than stored decomposed

`EnhancedAccessControl` is what stops one tenant writing into another's
subtree, and why an agent cannot rewrite its own records.

## The resolver

One resolver serves the whole subtree through ENSIP-10 wildcard resolution. It
computes its answers from the registries at read time.

- [`contracts/src/AgentResolver.sol`](contracts/src/AgentResolver.sol) — address, agent key, and ssh host key fingerprint
- [`contracts/src/interfaces/IAgentReadable.sol`](contracts/src/interfaces/IAgentReadable.sol) — what the resolver reads

## The nameserver

Answers `.eth` over ordinary DNS, so `ssh runner.acme.harness.eth` works with
no wallet and no plugin.

- [`dns/main.go`](dns/main.go) — the server
- [`dns/ens.go`](dns/ens.go) — namehash and resolver calls, without a full Ethereum library
- [`dns/rpc.go`](dns/rpc.go) — the one `eth_call` it makes

## ssh, answering to the same record

- [`tools/harness-authorized-keys`](tools/harness-authorized-keys) — sshd's `AuthorizedKeysCommand`, asking ENS whether a key may log in
- [`tools/harness-known-hosts`](tools/harness-known-hosts) — the host key fingerprint, from the same name

## Reading it from the app

- [`web/lib/tenant.ts`](web/lib/tenant.ts) — minting, revoking, and the registry ABI
- [`web/app/api/mesh/route.ts`](web/app/api/mesh/route.ts) — resolving a name to a machine

## Revoking

One transaction unregisters the name. Resolution, ssh access and spending stop
together, because all three read the same record.

- [`contracts/src/AgentRegistry.sol`](contracts/src/AgentRegistry.sol) — `revoke`
- [`contracts/test/`](contracts/test/) — the tests that hold it to that
