// The broker: it hands out capabilities, never keys.
//
// An Agent runs in a container with no key material of any kind. When it hits a
// 402 it sends the challenge here and gets back one thing: the `PAYMENT-SIGNATURE`
// header for that exact payment. It cannot sign a second payment with it, cannot
// learn the key that signed it, and cannot ask for anything the chain has not
// already agreed to.
//
// What the broker does per request, in order, refusing at the first failure:
//
//   1. names the caller — a container's address on the private network is
//      assigned by us and is not something the Agent can choose
//   2. asks the chain whether the Agent is still live: `agentKeyOf` returns zero
//      the moment the device signs a revoke, and every later request stops here
//   3. asks the chain how much the Agent may still spend in this window, and
//      refuses a payment larger than that
//   4. opens the Tenant's agent root with `wallet-cli ring decrypt` — the real
//      CLI, no human at the keyboard — and derives this Agent's key from it
//   5. funds the Agent under its Grant if it is short, which the registry checks
//      against the same ceiling
//   6. signs the EIP-3009 authorization with @x402/evm and returns the header
//
// The key exists for the length of one request and is never written anywhere.
// The root it came from is ciphertext on disk that only this Tenant's Ledger
// Key Ring can open.
//
//   node --experimental-strip-types broker.ts

import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { formatUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { REGISTRY_ABI, USDC, publicClient } from "./harness.ts";
import { USDC_3009_ABI } from "./exact.ts";
import { load } from "./grant.ts";
import { headroom } from "./headroom.ts";
import { settle, transferCall } from "./settle.ts";
import { agentSecrets, sealAsk } from "./keys.ts";

const exec = promisify(execFile);

/**
 * Each Tenant has a network of its own, so the broker has an address in each.
 *
 * It deliberately does not listen on 0.0.0.0. A Runner may reach exactly one
 * broker address — the gateway of its own isolated network — and the address a
 * request arrives on is as much a fact about the caller as the address it came
 * from.
 */
const PORT = Number(process.env.BROKER_PORT ?? 8402);
const NETWORK = "eip155:11155111";

/** A burner that pays gas and holds no authority. Never the Tenant's key. */
const RELAYER_PK = process.env.RELAYER_PK as Hex;
if (!RELAYER_PK) throw new Error("set RELAYER_PK — a burner with gas, never the Tenant's key");

const usd = (v: bigint) => `$${formatUnits(v, 6)}`;

/**
 * A sentence, not a stack trace.
 *
 * Whatever this returns is printed by the Agent in its own logs, so a bad
 * minute on a public RPC should read as "try again" rather than as a hundred
 * lines of ABI. A revert keeps its reason, which is the only part that matters.
 */
function explain(err: unknown): string {
  const raw = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  const reason = raw.match(/execution reverted:?\s*([^\n"]{3,120})/i)?.[1]?.trim();
  if (/exceeds allowance/i.test(raw)) return "the tenant has not allowed the executor to draw that much";
  if (/transfer amount exceeds balance/i.test(raw)) return "the tenant is out of USDC";
  if (/insufficient funds/i.test(raw)) return "the relayer is out of gas";
  if (/timeout|timed out|ETIMEDOUT|ECONNRESET|socket hang up|fetch failed/i.test(raw)) {
    return "the Sepolia RPC did not answer; nothing was spent, try again";
  }
  if (/rate.?limit|429/i.test(raw)) return "the Sepolia RPC is rate-limiting; try again shortly";
  if (reason) return `the chain refused it: ${reason}`;
  return raw.split("\n")[0]!.replace(/^\w*Error:?\s*/, "").trim() || "unknown failure";
}

/**
 * Which Agent is asking.
 *
 * Not from the request body: a caller does not get to say who it is. The
 * container's address on the private network was assigned by `run-tenant.sh`,
 * and podman is the authority on which container holds it.
 */
async function whoIsAsking(ip: string): Promise<{ tenant: string; agent: string; network: string }> {
  const { stdout } = await exec("sudo", [
    "-n", "podman", "ps",
    "--filter", "label=harness.tenant",
    "--format", "{{.Names}} {{.Labels}}",
  ]).catch(() => ({ stdout: "" }));

  for (const line of stdout.trim().split("\n").filter(Boolean)) {
    const [name] = line.split(" ");
    const { stdout: addr } = await exec("sudo", [
      "-n", "podman", "inspect", name!,
      "--format", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
    ]).catch(() => ({ stdout: "" }));
    if (addr.trim() !== ip) continue;

    const { stdout: labels } = await exec("sudo", [
      "-n", "podman", "inspect", name!,
      "--format",
      "{{index .Config.Labels \"harness.tenant\"}} {{index .Config.Labels \"harness.agent\"}}" +
        " {{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}",
    ]);
    const [tenant, agent, network] = labels.trim().split(" ");
    if (tenant && agent && network) return { tenant, agent, network };
  }
  throw new Error(`no Runner at ${ip}`);
}

/**
 * Refuses unless the chain still says this Agent may act.
 *
 * The same question the payment path asks, asked on its own, because handing
 * over an Agent's credentials deserves the same answer as handing over its
 * money. Revoke unregisters the name and `agentKeyOf` returns zero from that
 * block onward — so a revoked Agent stops being able to spend, stops resolving,
 * stops admitting an ssh key, and stops being given its secrets, all from the
 * one transaction.
 */
async function stillLive(tenant: string, agent: string) {
  const { grant, registry, agentPk, name } = load(agent, tenant);
  const account = privateKeyToAccount(agentPk);
  const live = (await publicClient.readContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: "agentKeyOf",
    args: [grant.label],
  })) as Address;
  if (live.toLowerCase() !== account.address.toLowerCase()) {
    throw Object.assign(new Error(`${name} has been revoked`), { status: 403 });
  }
  return name;
}

/**
 * What the Agent was given at provisioning, opened for it now.
 *
 * The values are sealed under the Tenant's ring and are never in the container
 * image, never in its environment as `podman inspect` would show it, and never
 * on its disk except where the Runner puts them at start. What crosses here is
 * the plaintext, over the Tenant's own private network, to a caller whose
 * identity came from the socket rather than from anything it said.
 */
async function secretsFor(ip: string, door: string) {
  const { tenant, agent, network } = await whoIsAsking(ip);
  const own = await gatewayOf(network);
  if (own && door !== own) {
    throw Object.assign(new Error(`${tenant} may only ask at ${own}`), { status: 403 });
  }
  const name = await stillLive(tenant, agent);
  const secrets = agentSecrets(tenant, agent);
  const names = Object.keys(secrets);
  console.log(`  ${name} <- ${names.length ? names.join(", ") : "no secrets"}`);
  return secrets;
}

/**
 * The read-only half of wallet-cli, lent to an Agent.
 *
 * wallet-cli cannot live in a Runner. Its platform binary is glibc-linked and
 * the Runner is Alpine: with gcompat it loads and then aborts. Reflavouring the
 * image would be a large change for a small gain, and the gain is smaller than
 * it looks — an Agent has no member key and no device, so most of wallet-cli
 * would refuse it anyway.
 *
 * What is left is worth having and is exactly the part that needs neither:
 * live yield rates, and token resolution. So the host runs them and the Agent
 * asks, which is the same shape as every other capability here.
 *
 * Strictly allowlisted. `send`, `swap execute`, `earn deposit` and every `ring`
 * subcommand are absent by construction rather than by filtering — those need a
 * device or the member key, and neither belongs at the end of a socket an Agent
 * can reach.
 */
const LEDGER_COMMANDS: Record<string, (a: Record<string, string>) => string[]> = {
  // Live rates across Kiln, Figment and StakeKit. No device, no account.
  yields: (a) => ["earn", "yields", ...(a.network ? ["--network", a.network] : []), "--output", "json"],
  // Which token an address is, and what an id resolves to.
  token: (a) => ["assets", "token", "--network", a.network ?? "ethereum", "--address", a.address ?? "", "--output", "json"],
  "token-by-id": (a) => ["assets", "token-by-id", "--id", a.id ?? "", "--output", "json"],
};

const WALLET_CLI =
  process.env.WALLET_CLI ??
  new URL("../web/node_modules/@ledgerhq/wallet-cli/bin/wallet-cli", import.meta.url).pathname;

async function ledgerFor(ip: string, door: string, body: Record<string, string>) {
  const { tenant, agent, network } = await whoIsAsking(ip);
  const own = await gatewayOf(network);
  if (own && door !== own) {
    throw Object.assign(new Error(`${tenant} may only ask at ${own}`), { status: 403 });
  }
  await stillLive(tenant, agent);

  const build = LEDGER_COMMANDS[body.cmd ?? ""];
  if (!build) {
    throw Object.assign(
      new Error(`no such command; this Agent may ask for: ${Object.keys(LEDGER_COMMANDS).join(", ")}`),
      { status: 400 },
    );
  }

  const { stdout } = await exec(WALLET_CLI, build(body), { maxBuffer: 1 << 22 });
  try {
    return JSON.parse(stdout);
  } catch {
    throw Object.assign(new Error("wallet-cli did not answer with JSON"), { status: 502 });
  }
}

/**
 * What this Agent may still spend, without spending anything to find out.
 *
 * The ceiling is on chain and an Agent should be able to read it before
 * committing rather than discovering it in a refusal. Knowing the answer is
 * the difference between "this costs more than I am allowed, shall I ask?" and
 * a loop of rejected payments.
 */
async function limitsFor(ip: string, door: string) {
  const { tenant, agent, network } = await whoIsAsking(ip);
  const own = await gatewayOf(network);
  if (own && door !== own) {
    throw Object.assign(new Error(`${tenant} may only ask at ${own}`), { status: 403 });
  }
  const name = await stillLive(tenant, agent);

  const { grant, registry, rootOfTree } = load(agent, tenant);
  const room = await headroom(registry, rootOfTree, grant);
  const cap = BigInt(grant.spends[0]?.allowance ?? 0);

  return {
    agent: name,
    live: true,
    token: "USDC",
    cap: cap.toString(),
    left: room.left.toString(),
    spent: (cap - room.left).toString(),
    capUsd: Number(cap) / 1e6,
    leftUsd: Number(room.left) / 1e6,
    expires: Number(grant.end),
  };
}

/**
 * An Agent saying it needs something it is not allowed to do.
 *
 * The ceiling is on chain, so wanting more cannot become having more. What an
 * Agent can do is stop and ask, and this is where the asking goes: sealed
 * under the tenant's ring, waiting for the dashboard to show it and a person
 * to decide with their device.
 *
 * This is deliberately not an escape hatch. Recording an ask grants nothing at
 * all — it moves the decision to somebody who can sign, which is the only
 * place it was ever going to be made.
 */
async function askFor(ip: string, door: string, body: Record<string, unknown>) {
  const { tenant, agent, network } = await whoIsAsking(ip);
  const own = await gatewayOf(network);
  if (own && door !== own) {
    throw Object.assign(new Error(`${tenant} may only ask at ${own}`), { status: 403 });
  }
  const name = await stillLive(tenant, agent);

  const want = String(body.want ?? "").slice(0, 400).trim();
  const why = String(body.why ?? "").slice(0, 800).trim();
  const usd = Number(body.usd ?? 0);
  if (!want) throw Object.assign(new Error("say what you need"), { status: 400 });
  if (!Number.isFinite(usd) || usd < 0 || usd > 1_000_000) {
    throw Object.assign(new Error("usd must be a number a person could plausibly approve"), { status: 400 });
  }

  const id = sealAsk(tenant, agent, { want, why, usd });
  console.log(`  ${name} asks for $${usd.toFixed(2)}: ${want}`);
  return {
    id,
    recorded: true,
    agent: name,
    note: "Recorded and shown to the owner. Nothing is granted until they sign.",
  };
}

/** Refuses unless the chain still says yes, and only for as much as it says. */
async function authorize(ip: string, door: string, challenge: Record<string, string>) {
  const { tenant, agent, network } = await whoIsAsking(ip);

  // 1b. Did it come in its own door? A Runner can route to another Tenant's
  //     gateway, and gets nothing by it — identity comes from the source
  //     address, so it would only ever be handed its own capability. Checking
  //     anyway costs one lookup and makes the boundary true rather than merely
  //     harmless.
  const own = await gatewayOf(network);
  if (own && door !== own) {
    throw Object.assign(new Error(`${tenant} may only ask at ${own}`), { status: 403 });
  }

  const { grant, registry, rootOfTree, agentPk, name } = load(agent, tenant);
  const account = privateKeyToAccount(agentPk);

  // 2. Is the Agent still live? Revoke unregisters the name, and this returns
  //    zero from that block onward. Nothing else has to be told.
  const live = (await publicClient.readContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: "agentKeyOf",
    args: [grant.label],
  })) as Address;
  if (live.toLowerCase() !== account.address.toLowerCase()) {
    throw Object.assign(new Error(`${name} has been revoked`), { status: 403 });
  }

  // Their client parses the challenge, so a malformed one is refused by the
  // same code the Agent would have used.
  const client = new x402Client()
    .register(NETWORK, new ExactEvmScheme(toClientEvmSigner(account)))
    .setSpendControls({
      allowedAssets: [{ network: NETWORK, asset: USDC, maxAmountPerPayment: "1000000" }],
    });
  const http = new x402HTTPClient(client);
  const required = http.getPaymentRequiredResponse((h) => challenge[h.toLowerCase()] ?? null);
  const terms = required.accepts[0] as Record<string, string>;
  const amount = BigInt(terms.amount ?? terms.maxAmountRequired!);

  // 3. Inside the ceiling the device set?
  const room = await headroom(registry, rootOfTree, grant);
  if (amount > room.left) {
    throw Object.assign(
      new Error(`${usd(amount)} exceeds the ${usd(room.left)} left of ${usd(room.cap)} today`),
      { status: 402 },
    );
  }

  // 5. Fund under the Grant if short. The registry checks this against the same
  //    ceiling, so a refusal here is the ceiling refusing, not the broker.
  const balance = (await publicClient.readContract({
    address: USDC,
    abi: USDC_3009_ABI,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;
  let funded: string | null = null;
  if (balance < amount) {
    funded = await settle({
      registry,
      rootOfTree,
      grant,
      agentPk,
      relayerPk: RELAYER_PK,
      calls: [transferCall(USDC, account.address, amount - balance)],
    });
  }

  // 6. One signature, for this payment only.
  const payload = await client.createPaymentPayload(required);
  const headers = http.encodePaymentSignatureHeader(payload);

  console.log(
    `  ${name} <- ${usd(amount)} to ${terms.payTo}` +
      (funded ? `, funded under the Grant (${funded.slice(0, 10)}…)` : ""),
  );
  return { headers, agent: name, amount: amount.toString(), left: (room.left - amount).toString() };
}

/** Only a refusal this code raised is a status; an exit code is not. */
function httpStatus(err: unknown): number {
  const s = (err as { status?: unknown }).status;
  return typeof s === "number" && s >= 400 && s <= 599 ? s : 500;
}

const handler = async (
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
) => {
  const send = (status: number, body: unknown) => {
    // A thrown child_process error carries `.status` too — the exit code, which
    // is 1, which is not an HTTP status. Passing it through crashed the whole
    // broker on the first failed decrypt, taking every Tenant's payments down
    // with it. Anything that is not a plausible response code is a 500.
    const code = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
    res.writeHead(status === 200 ? 200 : code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method !== "POST") return send(404, { error: "not found" });
  const routes = ["/capability", "/secrets", "/ledger", "/limits", "/ask"];
  if (!routes.includes(req.url ?? "")) return send(404, { error: "not found" });

  // ::ffff:10.89.0.2 on a dual-stack socket. Taken from the socket, never from
  // the body or a header: a caller does not get to say who it is.
  const strip = (a: string | undefined) => (a ?? "").replace(/^::ffff:/, "");
  const ip = strip(req.socket.remoteAddress);
  const door = strip(req.socket.localAddress);

  if (req.url === "/ledger" || req.url === "/limits" || req.url === "/ask") {
    try {
      const body =
        req.url === "/limits" ? {} : ((JSON.parse((await text(req)) || "{}")) as Record<string, string>);
      if (req.url === "/ask") return send(200, await askFor(ip, door, body));
      return send(200, req.url === "/ledger" ? await ledgerFor(ip, door, body) : await limitsFor(ip, door));
    } catch (err) {
      const status = httpStatus(err);
      const why = status === 500 ? explain(err) : (err as Error).message;
      console.log(`  refused ${ip}: ${why}`);
      return send(status, { error: why });
    }
  }

  if (req.url === "/secrets") {
    try {
      return send(200, await secretsFor(ip, door));
    } catch (err) {
      const status = httpStatus(err);
      const why = status === 500 ? explain(err) : (err as Error).message;
      console.log(`  refused ${ip}: ${why}`);
      return send(status, { error: why });
    }
  }

  let challenge: Record<string, string>;
  try {
    challenge = JSON.parse(await text(req));
  } catch {
    return send(400, { error: "expected the 402 response headers as JSON" });
  }

  try {
    send(200, await authorize(ip, door, challenge));
  } catch (err) {
    const status = httpStatus(err);
    // Refusals carry their own words already; anything else gets translated.
    const why = status === 500 ? explain(err) : (err as Error).message;
    console.log(`  refused ${ip}: ${why}`);
    send(status, { error: why });
  }
};

function text(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 64_000) reject(new Error("too large"));
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

/** The gateway of one Tenant network. */
async function gatewayOf(network: string): Promise<string | null> {
  const { stdout } = await exec("sudo", [
    "-n", "podman", "network", "inspect", network,
    "--format", "{{range .Subnets}}{{.Gateway}}{{end}}",
  ]).catch(() => ({ stdout: "" }));
  return stdout.trim() || null;
}

/** The gateway address of every Tenant network that exists right now. */
async function gateways(): Promise<string[]> {
  const { stdout } = await exec("sudo", [
    "-n", "podman", "network", "ls",
    "--filter", "name=^harness-", "--format", "{{.Name}}",
  ]).catch(() => ({ stdout: "" }));

  const found: string[] = [];
  for (const net of stdout.trim().split("\n").filter(Boolean)) {
    const { stdout: gw } = await exec("sudo", [
      "-n", "podman", "network", "inspect", net,
      "--format", "{{range .Subnets}}{{.Gateway}}{{end}}",
    ]).catch(() => ({ stdout: "" }));
    if (gw.trim()) found.push(gw.trim());
  }
  return found;
}

/**
 * Listens on every Tenant network, and keeps looking.
 *
 * A Tenant provisioned while this is running brings a new network with it, and
 * its Runner expects the broker to already be there — so new gateways are
 * picked up rather than waited for.
 */
const listening = new Set<string>();

async function bindAll() {
  for (const host of await gateways()) {
    if (listening.has(host)) continue;
    listening.add(host);
    createServer(handler)
      .listen(PORT, host, () => console.log(`  listening on ${host}:${PORT}`))
      .on("error", (e) => {
        listening.delete(host);
        console.log(`  could not listen on ${host}: ${(e as Error).message}`);
      });
  }
}

console.log("broker — capabilities only, never keys");
await bindAll();
if (listening.size === 0) console.log("  (no tenant networks yet; waiting)");
setInterval(() => void bindAll(), 30_000);
