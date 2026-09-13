# Ledger, in this repository

Where each part of the Ledger Agent Stack is used.

## Joining the ring from a host with no USB port

The device is never plugged into the server. The host makes its own member
keypair, the browser forwards bytes between the Ledger and the host without
holding a key, and one confirmation admits the host as a member.

- [`web/lib/ring-server.ts`](web/lib/ring-server.ts) — the LKRP flow, run on the host
- [`web/lib/relay.ts`](web/lib/relay.ts) — the relay the browser holds open
- [`web/lib/relay-client.ts`](web/lib/relay-client.ts) — the browser half, `hw-transport-webhid`
- [`web/app/api/enrolments/[id]/ring/route.ts`](web/app/api/enrolments/%5Bid%5D/ring/route.ts) — the one request the two overlap inside

## wallet-cli ring, usable on the VM afterwards

The trustchain and member credentials are written into wallet-cli's state, so
`ring encrypt` and `ring decrypt` work on that machine with no device present.

- [`web/lib/wallet-cli-state.ts`](web/lib/wallet-cli-state.ts) — writing the state directory
- [`web/lib/agent-root.ts`](web/lib/agent-root.ts) — sealing the tenant's agent root under the ring

## Secrets an agent cannot leak

Model keys and service tokens are sealed under the tenant's ring, kept as
ciphertext, and opened only at container start and only while the chain still
says the agent may act.

- [`web/lib/vault.ts`](web/lib/vault.ts) — what is sealed, and under which name
- [`x402/broker.ts`](x402/broker.ts) — `secretsFor`, which opens them only for a live agent
- [`runner/fetch-secrets`](runner/fetch-secrets) — the container asking for them at start

## Talking to the device

Two transports that cannot hold the HID handle at once, so a session is
opened, used, and released.

- [`web/lib/device-app.ts`](web/lib/device-app.ts) — Device Management Kit, sessions and app switching
- [`web/lib/provision.ts`](web/lib/provision.ts) — the flow that moves between Ledger Sync and Ethereum

## Signing the grant, and EIP-7702

Four setup transactions become one confirmation on the device.

- [`web/lib/delegation.ts`](web/lib/delegation.ts) — the 7702 delegation
- [`web/lib/tenant.ts`](web/lib/tenant.ts) — what the device is actually asked to sign
- [`web/lib/signing.ts`](web/lib/signing.ts) — the queue, for a device that is not in the room

## Human in the loop

Anything outside the grant goes back to the device for a person to sign.

- [`x402/broker.ts`](x402/broker.ts) — `askFor`, `escalateFor`, `confirmFor`
- [`tools/harness-approve`](tools/harness-approve) — approving from the host
- [`web/app/api/asks/approve/route.ts`](web/app/api/asks/approve/route.ts) — approving from the dashboard
