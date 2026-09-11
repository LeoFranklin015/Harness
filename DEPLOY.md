# Deploying

The app runs in two places and it is the same code in both. `HARNESS_BOX`
decides which one an instance is.

```
browser ──HTTPS──▶ Render: the app
                      │  five routes and the terminal upgrade
                      ▼
                   the box: the same app, plus the machines
                      ├── podman containers
                      ├── terminal server :8023
                      ├── broker :8402
                      └── nameserver on the mesh
```

Most of the app is happy anywhere: it reads the chain, reads Mongo, and hands
the browser something to sign. Five routes are not, because they do things that
exist on exactly one computer — run `podman` to build a container, `forge` to
deploy its executor, derive an Agent's key from a sealed root on that disk,
write the ring's identity into that kernel keyring. Those forward. See
`web/lib/box.ts`.

The in-page terminal is a websocket, which is why this is a Render Web Service
and not a serverless platform: a function that cannot carry an upgrade cannot
carry this product.

## Render

| | |
|---|---|
| Root Directory | `web` |
| Build Command | `npm ci && npm run build` |
| Start Command | `node server.mjs` |

Environment:

```
HARNESS_BOX           http://<box-ip>:3000
HARNESS_ORIGIN_TOKEN  <the box's token>
MONGODB_URI           <the same cluster the box uses>
TS_OAUTH_CLIENT_ID    <for minting mesh invites>
TS_OAUTH_CLIENT_SECRET
```

Do not set `PORT`; Render sets it.

## The box

`./tools/harness up`, with `HARNESS_BOX` **unset** — that is what makes it the
box rather than another deployment. Its `web/.env` keeps `HARNESS_ORIGIN_TOKEN`,
which it demands from every caller, and the deployed instance presents.

The box's port 3000 must be reachable from Render. On Oracle Cloud that is an
ingress rule on the subnet's security list, not just `firewall-cmd`.

## The asymmetry worth remembering

`HARNESS_ORIGIN_TOKEN` means two different things depending on `HARNESS_BOX`:

- **box** (`HARNESS_BOX` unset): the secret it *demands* of callers.
- **deployed** (`HARNESS_BOX` set): the secret it *presents*, and it demands
  nothing of browsers.

Set the same value in both. Set it in one only and nothing works, which is the
right way for that to fail.
