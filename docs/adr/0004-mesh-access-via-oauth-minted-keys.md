# Visitors reach Agents with OAuth-minted auth keys, never by sharing nodes

Someone who wants to use an Agent has to be able to reach it, and Agents live on a
private mesh. Two ways exist to let an outsider onto that mesh, and only one of them
can be pressed as a button.

## Decision

The platform holds a Tailscale **OAuth client** and mints an ephemeral, tagged auth key
per visitor through the API. The visitor runs `tailscale up --auth-key=…` and their own
device joins the tailnet as `tag:visitor`, reaching `tag:agent:22` and nothing else.

Node sharing is not used.

## Why not sharing

Sharing is a per-person, per-node action taken by a human in an admin console. It cannot
be automated, so it cannot be a button, so there is no self-serve onboarding — which is
the product. It also scales wrongly: ten visitors and three Agents is thirty clicks.

Sharing has a second problem. It grants access to a *node*, so the grant lives in
Tailscale's model and nowhere else. Nothing about it answers to the authority the rest of
this system runs on. A minted key is issued at the moment a Tenant is onboarded and dies
with the visitor's session, so mesh access is created by the same act that creates the
Tenant.

## What follows

- The tailnet policy needs `tag:visitor` alongside `tag:agent` in `tagOwners`, and one
  ACL line: `tag:visitor` → `tag:agent:22`.
- Keys are minted **ephemeral**, so a visitor's device disappears from the machine list
  when it goes offline. A revoked Agent must not leave devices behind.
- The OAuth client's credentials sit beside the deployer key in `contracts/.env`. They
  can mint keys for the tailnet, so they are a credential of the same weight.

## What this does not do

Mesh reachability is not authority. A visitor who reaches an Agent still has to satisfy
`AuthorizedKeysCommand`, which asks ENS whether their key may log in — so revoking the
Agent closes the door even while the visitor is still on the mesh. The two are deliberately
separate: Tailscale decides who can *route* to an Agent, the chain decides who may *enter*
it.
