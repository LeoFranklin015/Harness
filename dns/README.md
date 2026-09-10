# dns

Answers DNS for Agent names by asking the chain.

A name resolves only while its Agent still holds authority — the same check the
spend path runs, computed rather than stored. Revocation makes a name stop
resolving at the moment it stops being able to spend, with nothing to delete or
synchronise.

    ROOT_REGISTRY=0x… go run . -addr 127.0.0.1:5354

Answers NODATA with an SOA for types it does not serve. NXDOMAIN on an AAAA
would break `ssh` on macOS while leaving `dig` working, because getaddrinfo
resolves A and AAAA in parallel and RFC 8020 reads NXDOMAIN as "this name does
not exist".

Fails closed: an unreachable RPC returns SERVFAIL, never an answer.
