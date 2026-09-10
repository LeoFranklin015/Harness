import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { promisify } from "node:util";
import {
  createPublicClient,
  createWalletClient,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { explain } from "@/lib/explain";
import { sepoliaTransport } from "@/lib/rpc";
import { secret } from "@/lib/secrets";
import { visitorKeyFor } from "@/lib/sshkey";
import { BRAIN_VAR, BRAINS, sealSecrets, validName, type BrainChoice } from "@/lib/vault";
import { agentKeyFor } from "@/lib/agent-root";

/**
 * The platform's half of making a machine.
 *
 * Onboarding a Tenant is a platform act — `onboardTenant` is gated on the
 * platform's registrar role — so it is signed here with the deployer key. What
 * comes back is a registry whose `rootDevice` is the visitor's Ledger, and from
 * that point the platform can do nothing further inside it. `setExecutor`,
 * `setHost` and `grant` all require the device, and the browser asks it.
 *
 * Streams NDJSON, one event per step, so the slot on the page narrates what is
 * happening instead of spinning for a minute.
 */

const exec = promisify(execFile);

const PLATFORM = (process.env.PLATFORM_REGISTRY ??
  "0xbDF56e17F8956268Fc018B77Dac2ebEa7b3928F7") as Address;
const RESOLVER = (process.env.AGENT_RESOLVER ??
  "0x3735923a7e3CeCdc37F99eDdD8f22df70BB7e93f") as Address;
const RUNNER_DIR = process.env.RUNNER_DIR ?? "/home/opc/hackathon/runner";

const PLATFORM_ABI = [
  {
    type: "function",
    name: "onboardTenant",
    stateMutability: "nonpayable",
    inputs: [
      { name: "label", type: "string" },
      { name: "device", type: "address" },
      { name: "tenant", type: "address" },
      { name: "executor", type: "address" },
      { name: "resolver", type: "address" },
    ],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "getSubregistry",
    stateMutability: "view",
    inputs: [{ name: "label", type: "string" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "event",
    name: "TenantOnboarded",
    inputs: [
      { name: "label", type: "string", indexed: false },
      { name: "device", type: "address", indexed: true },
      { name: "tenant", type: "address", indexed: true },
      { name: "registry", type: "address", indexed: false },
    ],
  },
] as const;

const REGISTRY_ABI = [
  { type: "function", name: "rootDevice", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

/** Reads a variable out of contracts/.env without pulling the file into env. */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    label: string;
    agent: string;
    capUsd: string;
    days: string;
    /** Optional. Absent means nobody may SSH in until the device says so. */
    sshFingerprint?: string;
    device: Address;
    /** Which brain the machine runs, and its credential. Optional. */
    brain?: BrainChoice;
    brainSecret?: string;
    /** Anything else the Agent was given, one NAME=value per line. */
    extraSecrets?: string;
  };

  if (!/^[a-z0-9][a-z0-9-]{2,}$/.test(body.label)) return new Response("bad label", { status: 400 });
  if (body.sshFingerprint && !/^SHA256:[A-Za-z0-9+/]{43}$/.test(body.sshFingerprint)) {
    return new Response("bad fingerprint", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (o: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));

      try {
        const deployer = privateKeyToAccount(secret("PRIVATE_KEY") as Hex);
        const transport = sepoliaTransport();
        const pub = createPublicClient({ chain: sepolia, transport });
        const wallet = createWalletClient({ account: deployer, chain: sepolia, transport });

        // 1. The machine, so its host key exists before the name does.
        emit({ step: "Generating the machine's host key" });
        const built = await exec(`${RUNNER_DIR}/build-tenant.sh`, [body.label, body.agent], {
          cwd: RUNNER_DIR,
        });
        const hostKey = built.stdout.trim().split("\n").pop()!.trim() as Hex;
        if (!/^0x[0-9a-f]{64}$/.test(hostKey)) throw new Error(`host key: ${built.stdout}`);

        // 2. The Tenant, rooted in the visitor's device. After this the platform
        //    holds no authority inside it.
        //    A name is minted once. If an earlier attempt got this far and then
        //    stopped, the registry is already there and rooted in this device;
        //    it is reused, not re-registered — and a name rooted in some other
        //    device is refused, whoever is asking.
        let registry: Address;
        const existing = await pub.readContract({
          address: PLATFORM,
          abi: PLATFORM_ABI,
          functionName: "getSubregistry",
          args: [body.label],
        });
        if (existing !== ZERO) {
          const root = await pub.readContract({ address: existing, abi: REGISTRY_ABI, functionName: "rootDevice" });
          if (root.toLowerCase() !== body.device.toLowerCase()) {
            throw new Error(`${body.label}.harness.eth answers to a different device`);
          }
          registry = existing;
          emit({ registry, step: "Tenant already registered — resuming" });
        } else {
          emit({ step: "Registering the tenant on ENS" });
          const hash = await wallet.writeContract({
            address: PLATFORM,
            abi: PLATFORM_ABI,
            functionName: "onboardTenant",
            args: [body.label, body.device, body.device, ZERO, RESOLVER],
          });
          const receipt = await pub.waitForTransactionReceipt({ hash });
          const [ev] = parseEventLogs({ abi: PLATFORM_ABI, eventName: "TenantOnboarded", logs: receipt.logs });
          if (!ev) throw new Error("onboardTenant emitted nothing");
          registry = ev.args.registry as Address;
          emit({ registry, step: "Tenant registered" });
        }

        // 2b. Its executor. Anyone may deploy the contract — it is bound to the
        //     registry at construction and holds nothing — but only the device
        //     may tell the registry to use it, which is the browser's job next.
        emit({ step: "Deploying the tenant's executor" });
        const artifact = JSON.parse(
          readFileSync(
            "/home/opc/hackathon/contracts/out/AllowanceExecutor.sol/AllowanceExecutor.json",
            "utf8",
          ),
        ) as { abi: unknown[]; bytecode: { object: Hex } };
        const deployHash = await wallet.deployContract({
          abi: artifact.abi as never,
          bytecode: artifact.bytecode.object,
          args: [registry] as never,
        });
        const deployed = await pub.waitForTransactionReceipt({ hash: deployHash });
        const executor = deployed.contractAddress as Address;
        if (!executor) throw new Error("executor deployment returned no address");
        emit({ executor, step: "Executor deployed" });

        // 3. Start it on the mesh.
        emit({ step: "Starting the machine on the mesh" });
        // No environment across sudo: the script reads the mesh key from the
        // secrets file itself, so nothing secret sits in a command line.
        await exec("sudo", ["-n", `${RUNNER_DIR}/run-tenant.sh`, body.label, body.agent], {
          cwd: RUNNER_DIR,
        });

        let mesh: string | null = null;
        for (let i = 0; i < 30 && !mesh; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const { stdout } = await exec("sudo", [
            "-n", "podman", "exec", `harness-${body.label}`,
            "tailscale", "--socket=/run/tailscale/tailscaled.sock", "ip", "-4",
          ]).catch(() => ({ stdout: "" }));
          mesh = stdout.trim().split("\n")[0] || null;
        }
        if (!mesh) throw new Error("the machine never reached the mesh");
        emit({ meshAddress: mesh, step: "On the mesh" });

        // 4. Everything the device now has to sign for. The key derives from a
        //    root sealed under this Tenant's ring — the ring step earlier is
        //    what makes that possible — and only its address leaves this process.
        const agent = agentKeyFor(body.label, body.agent);
        // Who may SSH in. The visitor key derives from the same sealed root as
        // the Agent's own key, so its fingerprint is knowable here — which is
        // what makes every later invite free: the chain is told once, in a
        // signature the Tenant is giving anyway, and handing somebody a shell
        // afterwards costs no transaction at all.
        //
        // A caller may still name a fingerprint of their own, which wins. That
        // is the door for somebody who would rather use a key this host never
        // saw.
        // Seal what the Agent was given, under the same ring as its root. This
        // sits after the ring step for a reason: until the Tenant has joined,
        // there is nothing to seal with, and a secret sitting in this process
        // waiting for one is a secret in the wrong place.
        const secrets: Record<string, string> = {};
        if (body.brain && body.brain !== "none" && body.brainSecret?.trim()) {
          const chosen = BRAINS[body.brain];
          // Every whitespace character, not just the ends. `claude
          // setup-token` prints a token longer than most terminals are wide,
          // and copying it out of a wrapped display turns each line break into
          // a space inside the value. It looks right, it seals cleanly, and it
          // comes back "OAuth access token is invalid" hours later with
          // nothing to point at. No key or token of any provider contains
          // whitespace, so removing it can only help.
          secrets[chosen.env] = body.brainSecret.replace(/\s+/g, "");
          // Sealed with the credential on purpose: an Agent the chain will no
          // longer release secrets to is not told what to launch either, and
          // falls back to a plain shell rather than a CLI that cannot sign in.
          secrets[BRAIN_VAR] = chosen.brain;
        }
        for (const line of (body.extraSecrets ?? "").split("\n")) {
          const at = line.indexOf("=");
          if (at < 1) continue;
          const name = line.slice(0, at).trim();
          const value = line.slice(at + 1).trim();
          // A name that is not a variable name would be pasted into a shell
          // profile by the Runner, so it is refused rather than escaped.
          if (!value) continue;
          if (!validName(name)) throw new Error(`${name} is not a usable variable name`);
          secrets[name] = value;
        }
        if (Object.keys(secrets).length) {
          emit({ step: `Sealing ${Object.keys(secrets).length} secret(s) under the ring` });
          sealSecrets(body.label, body.agent, secrets);
        }

        const operator = body.sshFingerprint
          ? (`0x${Buffer.from(body.sshFingerprint.slice(7) + "=", "base64").toString("hex")}` as Hex)
          : visitorKeyFor(body.label, body.agent, true).operator;

        emit({
          step: "Waiting for the device",
          ready: {
            registry,
            meshAddress: mesh,
            hostKey,
            operator,
            agentKey: agent.address,
            ipv4: `0x${mesh.split(".").map((o) => Number(o).toString(16).padStart(2, "0")).join("")}`,
          },
        });
      } catch (err) {
        emit({ error: explain(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" },
  });
}
