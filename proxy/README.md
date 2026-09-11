# The front door

The dashboard runs on the box that holds the machines, because provisioning
shells out to `podman`, `tailscale` and `forge`. That cannot move to a
platform. But the browser needs HTTPS: WebHID will not hand over a Ledger
outside a secure context.

So this forwards both halves of a connection to the box, from a host that has
a certificate. Requests pass through, and so do upgrades — the in-page terminal
is a websocket, which is why Vercel cannot host this and Render can.

## Deploy

A Render **Web Service** from this repo:

- Root directory: `proxy`
- Build command: *(none)*
- Start command: `node server.mjs`
- Environment: `HARNESS_ORIGIN=<box-ip>:3000`

The box needs TCP 3000 reachable — in Oracle Cloud that is an ingress rule on
the subnet's security list, not just `firewall-cmd`.

## Why the Host header is not rewritten

The dashboard builds mesh invite links out of it. Rewrite it and you mint
invites pointing at an address nobody outside can reach.

## The token

The box's port must be open to the internet for this to reach it, so the box
refuses anything that does not carry `x-harness-origin`. This proxy adds it to
every request and to the websocket upgrade; a browser never sees it.

Set the same value in both places:

- the box, in `web/.env` as `HARNESS_ORIGIN_TOKEN`
- Render, as an environment variable of the same name

Leave it unset in both and the box is open, which is right when the two run on
one machine. Set it on only one side and nothing works, which is the correct
failure.

The broker is the one exception: it runs on the box and calls `/api/sign` with
a bearer token of its own, so it is let through without this one.
