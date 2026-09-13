# ENS, in this repository

### The registries, one subtree per tenant
[`contracts/src/PlatformRegistry.sol`](contracts/src/PlatformRegistry.sol) ·
[`contracts/src/AgentRegistry.sol`](contracts/src/AgentRegistry.sol) ·
[`contracts/src/GrantLib.sol`](contracts/src/GrantLib.sol)

### The resolver, computed through ENSIP-10 wildcard
[`contracts/src/AgentResolver.sol`](contracts/src/AgentResolver.sol) ·
[`contracts/src/interfaces/IAgentReadable.sol`](contracts/src/interfaces/IAgentReadable.sol)

### The nameserver, answering .eth over DNS
[`dns/main.go`](dns/main.go) ·
[`dns/ens.go`](dns/ens.go) ·
[`dns/rpc.go`](dns/rpc.go)

### ssh, answering to the same record
[`tools/harness-authorized-keys`](tools/harness-authorized-keys) ·
[`tools/harness-known-hosts`](tools/harness-known-hosts)

### Reading it from the app
[`web/lib/tenant.ts`](web/lib/tenant.ts) ·
[`web/app/api/mesh/route.ts`](web/app/api/mesh/route.ts)

### Revoking, one transaction
[`contracts/src/AgentRegistry.sol`](contracts/src/AgentRegistry.sol) ·
[`contracts/test/`](contracts/test/)
