# Ledger, in this repository

### Joining the ring from a host with no USB port
[`web/lib/ring-server.ts`](web/lib/ring-server.ts) ·
[`web/lib/relay.ts`](web/lib/relay.ts) ·
[`web/lib/relay-client.ts`](web/lib/relay-client.ts) ·
[`web/app/api/enrolments/[id]/ring/route.ts`](web/app/api/enrolments/%5Bid%5D/ring/route.ts)

### wallet-cli ring, usable on the VM afterwards
[`web/lib/wallet-cli-state.ts`](web/lib/wallet-cli-state.ts) ·
[`web/lib/agent-root.ts`](web/lib/agent-root.ts)

### Secrets an agent cannot leak
[`web/lib/vault.ts`](web/lib/vault.ts) ·
[`x402/broker.ts`](x402/broker.ts) ·
[`runner/fetch-secrets`](runner/fetch-secrets)

### Talking to the device
[`web/lib/device-app.ts`](web/lib/device-app.ts) ·
[`web/lib/provision.ts`](web/lib/provision.ts)

### Signing the grant, and EIP-7702
[`web/lib/delegation.ts`](web/lib/delegation.ts) ·
[`web/lib/tenant.ts`](web/lib/tenant.ts) ·
[`web/lib/signing.ts`](web/lib/signing.ts)

### Human in the loop
[`x402/broker.ts`](x402/broker.ts) ·
[`tools/harness-approve`](tools/harness-approve) ·
[`web/app/api/asks/approve/route.ts`](web/app/api/asks/approve/route.ts)
