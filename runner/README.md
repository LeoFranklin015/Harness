# Runner

The container an Agent lives in. Its sshd asks ENS who may log in, so shell
access answers to the same authority as spending.

```
ssh-keygen -q -N '' -t ed25519 -f ssh_host_ed25519_key   # generated here, not inside
echo runner.lab.harness.eth > name
podman build -t harness-runner .
podman run -d --name harness-runner -p 127.0.0.1:2222:22 harness-runner
```

Three things in the build are load-bearing:

- **The host key is generated outside and copied in.** `ssh-keygen -A` only
  creates keys that do not already exist, so an injected key survives it — and
  it means ENS can publish the key *before* the Runner is ever reachable,
  leaving no window in which a client has to trust on first use.
- **`AuthorizedKeysFile none`.** Without it sshd consults
  `~/.ssh/authorized_keys` first, and a key left there would survive
  revocation. There is no list of authorized keys anywhere on the host.
- **`sed 's/^runner:!/runner:*/' /etc/shadow`.** `adduser -D` leaves the
  account locked, and sshd refuses a locked account even for public-key auth.
  The Agent has no password at all, which is `*`, not `!`.

## The run, 2026-09-06

Both ends consulted ENS and nothing local was trusted — `known_hosts` pointed at
`/dev/null`, and no `authorized_keys` file exists in the container:

```
$ ssh -p 2222 -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=yes \
      -o KnownHostsCommand="…/harness-known-hosts %H runner.lab.harness.eth" \
      runner@127.0.0.1 '…'
  I am runner in 4b04348f1c18
  authorized_keys on this host:
    ls: /home/runner/.ssh: No such file or directory
```

Then one transaction revoked the Agent. The container was **not restarted, not
reconfigured, and not told anything**:

```
client side   harness: runner.lab.harness.eth publishes no host key
              KnownHostsCommand failed

server side   harness: runner.lab.harness.eth authorises nobody
              Failed publickey for runner … SHA256:zUTPHXYJ…
```

The same key, the same container, the same command. Both ends refuse
independently: disabling the client check only reaches a server that refuses
too.
