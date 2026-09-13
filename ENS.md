# ENS, in this repository

### The registries, one subtree per tenant
[`contracts/src/PlatformRegistry.sol`](https://github.com/LeoFranklin015/Harness/blob/main/contracts/src/PlatformRegistry.sol) ·
[`contracts/src/AgentRegistry.sol`](https://github.com/LeoFranklin015/Harness/blob/main/contracts/src/AgentRegistry.sol) ·
[`contracts/src/GrantLib.sol`](https://github.com/LeoFranklin015/Harness/blob/main/contracts/src/GrantLib.sol)

### The resolver, computed through ENSIP-10 wildcard
[`contracts/src/AgentResolver.sol`](https://github.com/LeoFranklin015/Harness/blob/main/contracts/src/AgentResolver.sol) ·
[`contracts/src/interfaces/IAgentReadable.sol`](https://github.com/LeoFranklin015/Harness/blob/main/contracts/src/interfaces/IAgentReadable.sol)

### The nameserver, answering .eth over DNS
[`dns/main.go`](https://github.com/LeoFranklin015/Harness/blob/main/dns/main.go) ·
[`dns/ens.go`](https://github.com/LeoFranklin015/Harness/blob/main/dns/ens.go) ·
[`dns/rpc.go`](https://github.com/LeoFranklin015/Harness/blob/main/dns/rpc.go)

### ssh, answering to the same record
[`tools/harness-authorized-keys`](https://github.com/LeoFranklin015/Harness/blob/main/tools/harness-authorized-keys) ·
[`tools/harness-known-hosts`](https://github.com/LeoFranklin015/Harness/blob/main/tools/harness-known-hosts)

### Reading it from the app
[`web/lib/tenant.ts`](https://github.com/LeoFranklin015/Harness/blob/main/web/lib/tenant.ts) ·
[`web/app/api/mesh/route.ts`](https://github.com/LeoFranklin015/Harness/blob/main/web/app/api/mesh/route.ts)

### Revoking, one transaction
[`contracts/src/AgentRegistry.sol`](https://github.com/LeoFranklin015/Harness/blob/main/contracts/src/AgentRegistry.sol) ·
[`contracts/test/`](https://github.com/LeoFranklin015/Harness/tree/main/contracts/test)
