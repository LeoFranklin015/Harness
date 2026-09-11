# Authority is enforced by our contracts, not by ENS

We considered having ENSv2's Enhanced Access Control enforce the core invariant — that a
child Agent's Cap, Tools and Expiry can never exceed its parent's — at the registry level,
so that over-broad grants would be refused by ENS itself rather than by application code.
**This is not possible.** We instead own the only contract permitted to write into the
subtree, and enforce the invariant there.

## Why EAC cannot do it

EAC is a fixed nybble-packed role bitmap: 32 regular roles plus 32 admin roles per
(resource, account), max 15 holders per role. The registry's entire role vocabulary is
enumerated in `RegistryRolesLib.sol` — `ROLE_REGISTRAR`, `ROLE_SET_PARENT`,
`ROLE_UNREGISTER`, `ROLE_RENEW`, `ROLE_SET_SUBREGISTRY`, `ROLE_SET_RESOLVER`, and a
handful more. It is a *who-may-call-which-function* mask. The ENS docs state the limit
directly: the model "doesn't support arbitrary predicates."

`PermissionedRegistry._register()` checks exactly one thing before minting — that the
caller holds `ROLE_REGISTRAR` — plus expiry sanity. There is no hook that could read a
child's Cap, and there structurally could not be: resolver records are written *after* the
mint, by a different contract. The registry has no concept of money.

## What we do instead

A custom registry and resolver that we own. ENS guarantees that only our contract may mint
under the parent and only our contract may write the records; our contract guarantees what
the values mean. EAC then withholds `ROLE_SET_RESOLVER`, `ROLE_SET_SUBREGISTRY` and the
per-record write roles from the child, so a child cannot rewrite its own Policy or swap out
the resolver holding it.

**ENS enforces who may write. We enforce what the values mean.** This is the pattern ENS's
own contract-developer documentation demonstrates, and `registry-hierarchy` explicitly
sanctions it: "a custom registry could implement `IRegistry` with entirely different
ownership and access models."

## Consequences

- The claim "the registry itself refuses an over-broad grant" is false and must not appear
  in the README or the demo narration. The true claim is narrower and still strong.
- Revocation cannot work by shortening Expiry — ENSv2 forbids reducing an expiry or setting
  one in the past. Revocation is `unregister()` plus an on-chain flag.
- **Do not key durable state on either token ids or resource ids.** Token ids regenerate on
  role change, transfer, and unregister/re-register. Resource ids are stable across role
  changes *only* — `_constructResource` returns
  `LibLabel.withVersion(anyId, _isExpired(entry.expiry) ? entry.eacVersionId + 1 : entry.eacVersionId)`,
  so the key changes on `unregister()` **and on expiry with no transaction at all**. Time
  passing silently repoints it, and `Spent` would read zero from a fresh slot.

  This breaks revocation specifically. `unregister()` does `++entry.eacVersionId` *and*
  sets `expiry = block.timestamp`, so within the revoking transaction the resource goes
  from `v` to `v+2`, while a later re-registration of the same label occupies `v+1`. A
  revoked flag written before the call lands on `v`; written after, on `v+2`; neither is
  ever read again. Key on `(registry address, unversioned label id)` plus an explicit
  tenure epoch we control.

- **Ancestor checks must read downward, not upward.** `unregister()` does not clear
  `entry.subregistry` and never touches the child's registry contract, so inspecting a
  child's own state reveals nothing. The signal is the parent's `getSubregistry(label)`
  returning `address(0)` once expired. And `getParent()` is self-declared via `setParent`,
  so any registry can claim any parent — every hop must assert
  `parent.getSubregistry(label) == previousHop`. Note this needs the plaintext label at
  every hop, not a hash.

- **`renew()` widens Expiry with no parent bound and no Grant.** The parent-expiry
  invariant is enforced at mint only. Override `renew()` and withhold `ROLE_RENEW` and
  `ROLE_UNREGISTER` alongside the resolver roles.

- **`unregister()` reverts on an already-expired name** (`_checkExpiryAndTokenRoles` throws
  `LabelExpired`), so the revocation path needs a fallback for a lapsed Agent.

- Pin a `contracts-v2` commit hash, not `main`. The surface is actively changing.
