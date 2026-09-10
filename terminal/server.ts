// A shell in the page, for as long as the chain still allows one.
//
// The dashboard mints a short-lived token naming one Agent; the browser opens a
// websocket with it; this asks the chain whether that Agent may be reached, and
// only then attaches a shell.
//
// The bridge is `podman exec` rather than ssh, and that was forced: a Tenant's
// network is `--opt isolate=strict`, which blocks the host as thoroughly as it
// blocks the other Tenants, and the host must never join the tailnet. So the
// host cannot reach the container's sshd at all. The on-chain check therefore
// happens here instead of inside sshd — the same question, asked one layer out,
// by the process that already holds the ring and could exec into any container
// regardless. Putting the check where the capability actually lives is more
// honest than routing it through sshd for appearances.
//
// It also buys what the ssh path cannot: this keeps asking. Revoke an Agent and
// the terminal somebody is looking at closes, mid-session, from the same
// transaction that stops it spending.
//
//   node --experimental-strip-types server.ts

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { Address } from "viem";
import { REGISTRY_ABI, publicClient } from "../x402/harness.ts";
import { load } from "../x402/grant.ts";
import { privateKeyToAccount } from "viem/accounts";

const PORT = Number(process.env.HARNESS_TERMINAL_PORT ?? 8023);

/** How often to re-ask. Short enough that a revoke is felt, not billed for. */
const RECHECK_MS = 15_000;

/**
 * Tokens the dashboard has minted, and what each one is for.
 *
 * In memory only. A restart forgets them, which is correct: they are worth
 * seconds and name nothing that outlives the process.
 */
type Ticket = { tenant: string; agent: string; expires: number };
const tickets = new Map<string, Ticket>();

/** Called over loopback by the dashboard, which is the only thing that can. */
function mint(tenant: string, agent: string): string {
  const now = Date.now();
  for (const [k, t] of tickets) if (t.expires <= now) tickets.delete(k);
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  tickets.set(token, { tenant, agent, expires: now + 60_000 });
  return token;
}

/**
 * Is this Agent still live, according to the chain?
 *
 * The same predicate the broker uses before it will sign, and the same one
 * `harness-authorized-keys` asks ENS before it will admit a key. Revoke
 * unregisters the name and this returns false from that block onward.
 */
async function live(tenant: string, agent: string): Promise<boolean> {
  try {
    const { grant, registry, agentPk } = await load(agent, tenant);
    const expected = privateKeyToAccount(agentPk).address;
    const actual = (await publicClient.readContract({
      address: registry,
      abi: REGISTRY_ABI,
      functionName: "agentKeyOf",
      args: [grant.label],
    })) as Address;
    return actual.toLowerCase() === expected.toLowerCase();
  } catch {
    // Fail closed. An unreachable chain is not permission.
    return false;
  }
}

const http = createServer((req, res) => {
  // Minting is loopback-only: the dashboard runs on this host, and nothing
  // else has any business asking for a shell on someone's machine.
  const from = (req.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
  if (from !== "127.0.0.1" && from !== "::1") {
    res.writeHead(403).end("no");
    return;
  }
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method !== "POST" || url.pathname !== "/mint") {
    res.writeHead(404).end("no");
    return;
  }
  const tenant = (url.searchParams.get("tenant") ?? "").replace(/[^a-z0-9-]/g, "");
  const agent = (url.searchParams.get("agent") ?? "").replace(/[^a-z0-9-]/g, "");
  if (!tenant || !agent) {
    res.writeHead(400).end("no");
    return;
  }
  res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify({ token: mint(tenant, agent), port: PORT }));
});

const wss = new WebSocketServer({ server: http });

wss.on("connection", async (ws: WebSocket, req) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const token = url.searchParams.get("token") ?? "";

  const ticket = tickets.get(token);
  // Spent on use: a token buys one shell, and a URL in someone's history buys
  // nothing.
  tickets.delete(token);

  const say = (s: string) => ws.readyState === ws.OPEN && ws.send(s);

  if (!ticket || ticket.expires <= Date.now()) {
    say("\r\n\x1b[31mThis terminal link has expired. Close and open it again.\x1b[0m\r\n");
    return ws.close();
  }

  const { tenant, agent } = ticket;

  if (!(await live(tenant, agent))) {
    say(`\r\n\x1b[31m${agent}.${tenant}.harness.eth has been revoked — no shell.\x1b[0m\r\n`);
    return ws.close();
  }

  // `-t` gives the process a real pty inside the container even though nothing
  // here is a terminal, which is what makes an interactive shell work at all.
  // The size is fixed: podman has no way to be told about a resize after the
  // fact, so the panel is sized to match rather than the other way round.
  const shell = spawn(
    "sudo",
    [
      "-n", "podman", "exec", "-it",
      "-e", "COLUMNS=100", "-e", "LINES=30", "-e", "TERM=xterm-256color",
      "-e", "HARNESS_WEB_TERMINAL=1",
      // The same account ssh would have given, not root. A shell in the page
      // should be the shell you would have got the long way round; handing out
      // root because podman exec defaults to it is an accident, not a decision.
      "-u", "runner",
      "-w", "/home/runner",
      `harness-${tenant}`,
      "/bin/sh", "-l",
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );

  shell.stdout.on("data", (d: Buffer) => say(d.toString("utf8")));
  shell.stderr.on("data", (d: Buffer) => say(d.toString("utf8")));

  ws.on("message", (data) => {
    if (shell.stdin.writable) shell.stdin.write(data.toString());
  });

  // Keep asking. This is the part that makes revoke mean something to a shell
  // somebody already has open.
  const watch = setInterval(async () => {
    if (await live(tenant, agent)) return;
    say(`\r\n\x1b[31m${agent}.${tenant}.harness.eth was revoked. Closing.\x1b[0m\r\n`);
    shell.kill("SIGKILL");
    ws.close();
  }, RECHECK_MS);

  const done = () => {
    clearInterval(watch);
    shell.kill("SIGKILL");
    if (ws.readyState === ws.OPEN) ws.close();
  };
  shell.on("exit", done);
  ws.on("close", done);
  ws.on("error", done);
});

// Loopback only. The dashboard splices websockets through on its own port, so
// nothing outside this host ever needs to reach here — and a shell server is
// the last thing that should be listening on a public interface.
http.listen(PORT, "127.0.0.1", () => {
  console.log("terminal — a shell for as long as the chain allows one");
  console.log(`  listening on 127.0.0.1:${PORT}`);
  console.log("  reached only through the dashboard; every session re-checks the chain");
});
