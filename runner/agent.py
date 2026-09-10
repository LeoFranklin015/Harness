#!/usr/bin/env python3
"""The Agent: it pays for what it uses, and holds nothing it could leak.

There is no key in this file, in this container, or in its environment. When the
seller answers 402, the Agent forwards that challenge to the broker on the host
and gets back one `PAYMENT-SIGNATURE` header, good for that payment and no
other. It could not sign a second payment if it wanted to, and it could not tell
you the address it paid from until the broker names it.

That is the whole point of running it this way. An Agent that holds an API key
can leak the API key. This one has nothing to leak: the authority lives on a
Ledger, the key lives inside one request on the host, and what reaches the
container is a signature over a payment the chain already agreed to.

Stdlib only, so the container needs nothing installed to run it.

    agent.py [rounds]
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

BROKER = os.environ.get("HARNESS_BROKER", "http://10.89.0.1:8402")
SELLER = os.environ.get("HARNESS_SELLER", "http://10.89.0.1:4023")
NAME = open("/etc/harness/name").read().strip()


def get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, dict(r.headers), json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), json.loads(e.read() or b"{}")


def ask_broker(challenge):
    """Trade a 402 for the header that answers it. The only privileged step."""
    body = json.dumps({k.lower(): v for k, v in challenge.items()}).encode()
    req = urllib.request.Request(
        f"{BROKER}/capability", data=body, headers={"content-type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        # A refusal is the system working: the chain said no, or the ceiling did.
        try:
            why = json.loads(e.read())["error"]
        except Exception:
            why = f"HTTP {e.code}"
        raise SystemExit(f"  refused by the broker: {why}")
    except urllib.error.URLError as e:
        # Not a refusal — the broker is not there. Worth saying plainly rather
        # than unwinding a stack the reader cannot act on.
        raise SystemExit(f"  cannot reach the broker at {BROKER} ({e.reason}) — is it running?")


def buy(round_no):
    url = f"{SELLER}/research?q=round-{round_no}"
    try:
        status, headers, _ = get(url)
    except urllib.error.URLError as e:
        raise SystemExit(f"  cannot reach the seller at {SELLER} ({e.reason})")
    if status != 402:
        raise SystemExit(f"  expected 402 from the seller, got {status}")

    grantee = ask_broker(headers)
    print(f"  broker signed for {grantee['agent']}: ${int(grantee['amount']) / 1e6:.2f}")

    status, _, body = get(url, grantee["headers"])
    if status != 200:
        raise SystemExit(f"  seller refused: {body.get('error', status)}")
    print(f"  served: {json.dumps(body.get('answer'))}")
    print(f"  ${int(grantee['left']) / 1e6:.2f} left in today's ceiling")


def main():
    rounds = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    print(f"agent {NAME}")
    print("  no key in this container — the broker signs, the Ledger decides\n")
    for r in range(1, rounds + 1):
        print(f"round {r}")
        buy(r)
        print()
        time.sleep(1)
    print("done.")


if __name__ == "__main__":
    main()
