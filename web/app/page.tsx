"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Address, Hex } from "viem";
import { ConnectLedger } from "@/components/ledger/ConnectLedger";
import { DeviceHolder } from "@/components/DeviceHolder";
import { AccountMenu } from "@/components/AccountMenu";
import { UpgradeAccount } from "@/components/ledger/UpgradeAccount";

import { TenantSlot, type Tenant } from "@/components/tenants/TenantSlot";
import type { Ask } from "@/components/tenants/Asks";
import { RejectedOnDevice, type Device } from "@/lib/ledger";
import {
  declineUpgrade,
  loadTenants,
  remember,
  remembered,
  saveTenant,
  Session,
  upgradeDeclined,
  type Authority,
} from "@/lib/session";
import { explain } from "@/lib/explain";
import { finishOnChain } from "@/lib/provision";
import { agentIdFrom, allowanceFor, calldata, firstGrant, readHost, REGISTRY_ABI, USDC } from "@/lib/tenant";
import { sepoliaTransport } from "@/lib/rpc";
import { createPublicClient } from "viem";
import { sepolia } from "viem/chains";

/**
 * Two pages, one gate.
 *
 * Nothing is shown until a device has been connected, because there is nothing
 * to show: a Tenant is rooted in a device, and without one there is no
 * authority to display or to spend. Once it has — this tab or an earlier one —
 * the page opens on its machines; the Ledger is asked again only when there is
 * something to sign.
 */
export default function Home() {
  // `undefined` until the browser has had a chance to answer; localStorage is
  // not there during server render and guessing makes the two trees disagree.
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  /** null while unknown — the answer comes from the chain, not from us. */
  const [upgraded, setUpgraded] = useState<boolean | null>(null);
  const [offering, setOffering] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const a = remembered();
    setSession(a ? new Session(a) : null);
  }, []);

  // Whether this account can batch is a fact about the chain, so it is asked
  // rather than remembered — someone may have upgraded it elsewhere.
  useEffect(() => {
    if (!session) return;
    let live = true;
    fetch(`/api/delegate?address=${session.authority.address}`)
      .then((r) => r.json())
      .then((d) => live && setUpgraded(!!d.upgraded))
      .catch(() => live && setUpgraded(null));
    return () => {
      live = false;
    };
  }, [session]);

  /**
   * One tap, and no gas.
   *
   * The device signs only the authorisation — a standalone object saying this
   * account may run that code — and the host puts it on chain. Nothing the host
   * does can change what was signed: alter the delegate, the chain or the nonce
   * and it recovers to a different account and does nothing at all.
   */
  async function runUpgrade() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const dev = await session.device(setStep);
      const info = await (await fetch(`/api/delegate?address=${dev.address}`)).json();
      if (info.upgraded) {
        setUpgraded(true);
        setOffering(false);
        return;
      }
      const sig = await dev.authorize(info.nonce, setStep);

      setStep("Publishing the upgrade");
      const res = await fetch("/api/delegate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: dev.address, nonce: info.nonce, ...sig }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? `upgrade failed (${res.status})`);

      setUpgraded(true);
      setOffering(false);
    } catch (err) {
      setError(
        err instanceof RejectedOnDevice
          ? "Declined on the device. Nothing changed."
          : explain(err),
      );
    } finally {
      setBusy(false);
      setStep(null);
    }
  }

  if (session === undefined) return null;

  if (!session) {
    return (
      <ConnectLedger
        onConnected={(dev: Device) => {
          const authority: Authority = { address: dev.address, path: dev.path, model: dev.model };
          remember(authority);
          setSession(new Session(authority, dev));
          setAppVersion(dev.appVersion);
          // Offer the upgrade while the device is still in hand, and only to
          // someone who has not already said no on this browser.
          fetch(`/api/delegate?address=${dev.address}`)
            .then((r) => r.json())
            .then((d) => {
              setUpgraded(!!d.upgraded);
              if (!d.upgraded && !upgradeDeclined(dev.address)) setOffering(true);
            })
            .catch(() => {});
        }}
      />
    );
  }

  if (offering) {
    return (
      <UpgradeAccount
        address={session.authority.address}
        appVersion={appVersion}
        busy={busy}
        step={step}
        error={error}
        onUpgrade={runUpgrade}
        onSkip={() => {
          declineUpgrade(session.authority.address);
          setOffering(false);
        }}
      />
    );
  }

  return (
    <Machines
      session={session}
      upgraded={upgraded === true}
      onUpgrade={runUpgrade}
      upgrading={busy}
      onForget={async () => {
        await session.release();
        remember(null);
        setSession(null);
        setUpgraded(null);
      }}
    />
  );
}

/** Two slots, because you have two devices. Add more when you have more. */
const SLOTS = 2;

/** The device app LKRP speaks to. Not Ethereum. */
const RING_APP = "Ledger Sync";

function Machines({
  session,
  upgraded,
  upgrading,
  onUpgrade,
  onForget,
}: {
  session: Session;
  upgraded: boolean;
  upgrading: boolean;
  onUpgrade: () => void;
  onForget: () => void;
}) {
  const { authority } = session;
  const [tenants, setTenants] = useState<(Tenant | null)[]>(() => Array(SLOTS).fill(null));
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  // What this device holds is the server's answer, not this tab's memory, so
  // it is fetched rather than restored. Until it arrives the slots are empty,
  // which is also what they look like when there is nothing in them.
  useEffect(() => {
    let stale = false;
    loadTenants(authority.address, SLOTS).then((held) => {
      if (!stale) setTenants(held);
    });
    return () => {
      stale = true;
    };
  }, [authority.address]);

  const taken = tenants.filter(Boolean).map((t) => t!.label);

  function setSlot(i: number, next: Tenant | null) {
    setTenants((prev) => prev.map((t, j) => (j === i ? next : t)));
    // Fire and forget: the page has already moved, and a store that refuses is
    // reported through `record` where the answer can still change what happens.
    void saveTenant(authority.address, i, next);
  }
  function patch(i: number, changes: Partial<Tenant>) {
    setTenants((prev) => {
      const next = prev.map((t, j) => (j === i && t ? { ...t, ...changes } : t));
      void saveTenant(authority.address, i, next[i]);
      return next;
    });
  }
  /** A slot the server has to accept before the work behind it is worth doing. */
  async function record(i: number, next: Tenant): Promise<boolean> {
    const refused = await saveTenant(authority.address, i, next);
    if (refused) {
      setSlot(i, null);
      setError(refused);
      return false;
    }
    setTenants((prev) => prev.map((t, j) => (j === i ? next : t)));
    return true;
  }
  function narrate(slot: number, step: string) {
    // Steps are narration, not state worth a round trip on every line.
    setTenants((prev) => prev.map((t, j) => (j === slot && t ? { ...t, step } : t)));
  }
  function fail(slot: number, err: unknown, fallback: Tenant | null = null) {
    setSlot(slot, fallback);
    setError(
      err instanceof RejectedOnDevice
        ? "Declined on the device. Nothing was created."
        : explain(err),
    );
  }

  /**
   * The second half, for a machine caught mid-flow.
   *
   * New machines are built on /machines/new now, but a provision interrupted
   * by a refresh leaves a slot here with its ring already made — and a ring
   * cannot be made twice for the same name. So the dashboard keeps the way
   * to finish one, and runs the same code the wizard does rather than a
   * second copy of it.
   */
  async function continueProvision(tenant: Tenant) {
    const slot = tenants.findIndex((t) => t?.label === tenant.label);
    const req = tenant.request;
    if (!req) return;
    setError(null);
    patch(slot, { awaiting: false });
    const say = (s: string) => narrate(slot, s);

    try {
      const out = await finishOnChain({
        session,
        req,
        upgraded,
        say,
        onPartial: (partial) => patch(slot, partial),
      });
      setSlot(slot, {
        label: req.label,
        registry: out.registry,
        meshAddress: out.meshAddress,
        agent: req.agent,
        agentId: out.agentId,
        cap: `$${req.capUsd}/day`,
        status: "live",
      });
    } catch (err) {
      // The ring is done and cannot be undone; keep the slot so they can retry
      // the chain half rather than making a second ring for the same name.
      fail(slot, err, {
        ...tenant,
        awaiting: true,
        step: "Stopped. Open Ethereum on your device, then continue.",
      });
    }
  }

  /** One signature on the device. Everything that answers to it stops. */
  /**
   * Opens the door, if it is not already open.
   *
   * The visitor key derives from the Tenant's sealed root, so the fingerprint
   * the chain was told at provisioning is the same one every later invite
   * hands out. Which means this almost always has nothing to do: it reads what
   * the chain says, finds it already correct, and returns without a signature
   * or a transaction. Inviting someone should not cost a tap.
   *
   * When it does differ — an older machine set up before this, or a Tenant who
   * registered a key of their own — it costs exactly one. `setHost` writes the
   * address, the host key and the operator together, because they are one fact
   * about one machine, so the two that are not changing are read back from the
   * chain rather than remembered: a page left open since before the machine
   * moved must not relocate it as a side effect of granting a shell.
   */
  async function authorise(tenant: Tenant, operator: Hex) {
    const i = tenants.findIndex((t) => t?.label === tenant.label);
    setError(null);
    try {
      const pub = createPublicClient({ chain: sepolia, transport: sepoliaTransport() });
      const host = await readHost(pub as never, tenant.registry);

      // Already the key the chain admits. Nothing to sign.
      if (host.operator.toLowerCase() === operator.toLowerCase()) return;

      const dev = await session.device((s) => narrate(i, s));
      await dev.send(
        { to: tenant.registry, data: calldata.setHost(host.ipv4, host.hostKey, operator) },
        (s) => narrate(i, s),
      );
    } catch (err) {
      // Thrown on, not swallowed: the invite must not present itself as usable
      // when the door never opened.
      fail(i, err, tenant);
      throw err;
    }
  }

  /**
   * Doing what an agent asked, once you have agreed to it.
   *
   * Two shapes, and the difference matters. A payment the agent could not
   * make is made by you, from your own account, exactly once — approving an
   * invoice should not widen what the agent may do tomorrow. Anything else is
   * a request for more room, and that is a new Grant at a higher ceiling.
   *
   * The transaction is built server-side from the chain, so this signs what
   * the endpoint says rather than reconstructing it and hoping the two agree.
   */
  async function approveAsk(tenant: Tenant, ask: Ask, _newCapUsd: number) {
    const i = tenants.findIndex((t) => t?.label === tenant.label);
    setError(null);

    try {
      const plan = await fetch(
        `/api/asks/approve?${new URLSearchParams({
          tenant: tenant.label,
          id: ask.id,
          registry: tenant.registry,
          cap: String(Number(tenant.request?.capUsd ?? 0)),
          days: String(Number(tenant.request?.days ?? 30)),
        })}`,
      ).then((r) => r.json());
      if (plan.error) throw new Error(plan.error);

      const dev = await session.device((step) => narrate(i, step));
      let receipt;
      for (const t of plan.transactions as Array<{ to: Address; data: Hex; what: string }>) {
        narrate(i, `Ledger — ${t.what}`);
        receipt = await dev.send({ to: t.to, data: t.data }, (step) => narrate(i, step));
      }

      if (plan.kind === "transfer") {
        // Nothing about the machine changed; you simply paid something.
        setSlot(i, { ...tenant, status: "live" });
        return;
      }

      const agentId = receipt ? agentIdFrom(receipt.logs) : null;
      await fetch("/api/grants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenant: tenant.label,
          label: ask.label,
          agentKey: (await fetch("/api/agent-key", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ label: tenant.label, agent: ask.label }),
          }).then((r) => r.json())).agentKey,
          start: Math.floor(Date.now() / 1000) - 60,
          end: Math.floor(Date.now() / 1000) + Number(tenant.request?.days ?? 30) * 86400,
          cap: String(Math.round(plan.newCapUsd * 1_000_000)),
          registry: tenant.registry,
          agentId,
        }),
      });

      setSlot(i, {
        ...tenant,
        status: "live",
        agentId: (agentId ?? tenant.agentId) as `0x${string}` | undefined,
        cap: `$${plan.newCapUsd.toFixed(0)}/day`,
        request: tenant.request
          ? { ...tenant.request, capUsd: String(plan.newCapUsd) }
          : tenant.request,
      });
    } catch (err) {
      fail(i, err, { ...tenant, status: "live" });
      throw err;
    }
  }

  async function revoke(tenant: Tenant) {
    const i = tenants.findIndex((t) => t?.label === tenant.label);
    if (!tenant.agentId) return;
    setError(null);
    setSlot(i, { ...tenant, status: "provisioning", step: "Ledger — revoke the agent" });
    try {
      const dev = await session.device((s) => narrate(i, s));
      await dev.send({ to: tenant.registry, data: calldata.revoke(tenant.agentId) }, (s) => narrate(i, s));
      setSlot(i, { ...tenant, status: "revoked" });
    } catch (err) {
      fail(i, err, { ...tenant, status: "live" });
    }
  }

  return (
    <div className="min-h-dvh px-8 py-14 lg:px-20">
      <header className="mb-12 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
            <span className="h-px w-8 bg-neutral-700" />
            Harness
          </div>
          <h1 className="text-2xl font-medium tracking-tight text-neutral-50">Your machines</h1>
        </div>

        <AccountMenu
          address={authority.address}
          model={authority.model}
          path={authority.path}
          upgraded={upgraded}
          upgrading={upgrading}
          onUpgrade={onUpgrade}
          onForget={onForget}
        />
      </header>

      {error && (
        <p className="mb-5 rounded-lg border border-amber-900/50 bg-amber-950/30 px-4 py-2.5 text-sm text-amber-300/90" role="alert">
          {error}
        </p>
      )}

      {/* This tab can answer for a shell that has no device — see DeviceHolder. */}
      <DeviceHolder
        session={session}
        authority={authority.address}
        tenants={tenants.filter((t): t is Tenant => !!t && t.status === "live").map((t) => t.label)}
      />

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {tenants.map((tenant, i) => (
          <TenantSlot
            key={i}
            tenant={tenant}
            onAdd={() => router.push("/machines/new")}
            onContinue={continueProvision}
            onRevoke={revoke}
            onAuthorise={authorise}
            onRaise={approveAsk}
          />
        ))}
      </div>

    </div>
  );
}
