"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Address } from "viem";

import { Assembly, STAGES, type AssemblyStage } from "@/components/provision/Assembly";
import type { ProvisionRequest } from "@/components/tenants/ProvisionDialog";
import {
  CATALOGUE,
  DEFAULT_CAPABILITIES,
  anyExecutable,
  byId,
  validateCustom,
  type CustomRule,
} from "@/lib/capabilities";
import { explain } from "@/lib/explain";
import { RejectedOnDevice } from "@/lib/ledger";
import { finishOnChain, startRing } from "@/lib/provision";
import { Session, remembered, saveTenant, short, type Authority } from "@/lib/session";

/**
 * Making a machine, as a page rather than a dialog.
 *
 * A dialog was right when the whole decision was a name and a number. It is
 * the wrong shape for choosing what an Agent may call: those are the terms
 * the device is about to sign and the last moment any of them are editable,
 * and they deserve more room than a box floating over the thing they are
 * about to change.
 *
 * Four steps, and the last one is not a summary — it is the build. The two
 * taps happen there, with the machine assembling beside them, because a
 * minute of waiting is better spent showing what is being made than showing
 * that something is happening.
 */

const STEPS = ["Identity", "Capabilities", "Secrets", "Build"] as const;
type StepIndex = 0 | 1 | 2 | 3;

const LABEL_OK = /^[a-z0-9][a-z0-9-]*$/;

export default function NewMachine() {
  const router = useRouter();
  const [authority, setAuthority] = useState<Authority | null | undefined>(undefined);
  const [session, setSession] = useState<Session | null>(null);
  const [taken, setTaken] = useState<string[]>([]);
  const [step, setStep] = useState<StepIndex>(0);
  const [stage, setStage] = useState<AssemblyStage>(0);
  const [working, setWorking] = useState(false);

  const [form, setForm] = useState<ProvisionRequest>({
    label: "",
    agent: "runner",
    capUsd: "10",
    days: "30",
    brain: "claude-plan",
    brainSecret: "",
    extraSecrets: "",
    capabilities: [...DEFAULT_CAPABILITIES],
    customRules: [],
  });

  // The device is remembered; the connection is not. A page opened fresh
  // rebuilds the session and reconnects on the first click that needs it.
  useEffect(() => {
    const a = remembered();
    setAuthority(a);
    if (a) setSession(new Session(a));
  }, []);

  useEffect(() => {
    if (!authority) return;
    fetch(`/api/tenants?authority=${authority.address}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setTaken((d.slots ?? []).filter(Boolean).map((t: { label: string }) => t.label)))
      .catch(() => {});
  }, [authority]);

  const set = (changes: Partial<ProvisionRequest>) => setForm((f) => ({ ...f, ...changes }));

  // Filling the form fits the first three parts. The driver bites for a
  // moment at each one rather than the part simply being there, so progress
  // through the form looks like progress on the machine.
  useEffect(() => {
    const target = Math.min(step, 3) as AssemblyStage;
    if (target <= stage) return;
    setWorking(true);
    const bite = setTimeout(() => {
      setStage(target);
      setWorking(false);
    }, 850);
    return () => clearTimeout(bite);
  }, [step, stage]);

  const labelError = useMemo(() => {
    if (!form.label) return null;
    if (!LABEL_OK.test(form.label)) return "Lower case letters, numbers and hyphens.";
    if (taken.includes(form.label)) return "You already have a machine with that name.";
    return null;
  }, [form.label, taken]);

  const canLeave: Record<StepIndex, boolean> = {
    0: !!form.label && !labelError && LABEL_OK.test(form.agent),
    1: Number(form.capUsd) > 0 && Number(form.days) > 0,
    2: form.brain === "none" || form.brainSecret.trim().length > 0,
    3: true,
  };

  if (authority === undefined) return null;
  if (!authority) {
    return (
      <Shell>
        <p className="text-sm text-neutral-400">
          No device remembered in this browser.{" "}
          <button onClick={() => router.push("/")} className="underline underline-offset-2">
            Connect one first
          </button>
          .
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="mb-10">
        <button
          onClick={() => router.push("/")}
          className="mb-6 text-xs text-neutral-600 transition hover:text-neutral-400"
        >
          ← Your machines
        </button>
        <h1 className="text-2xl font-medium tracking-tight text-neutral-50">A new machine</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Signed by {short(authority.address)}. Everything here is fixed on chain by that
          signature.
        </p>
      </header>

      <Rail step={step} onJump={(i) => i < step && setStep(i)} />

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-20">
        {/* One column of reading width. A form that spans a 27-inch monitor
            is not "using the space", it is unreadable. */}
        <div className="max-w-xl">
          {step === 0 && <Identity form={form} set={set} error={labelError} />}
          {step === 1 && <Capabilities form={form} set={set} />}
          {step === 2 && <Secrets form={form} set={set} />}
          {step === 3 && session && (
            <Build
              session={session}
              req={form}
              authority={authority}
              onStage={setStage}
              onWorking={setWorking}
              onDone={() => router.push("/")}
            />
          )}

      {step < 3 && (
        <div className="mt-10 flex items-center gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep((s) => (s - 1) as StepIndex)}
              className="rounded-full border border-neutral-800 px-5 py-2 text-xs text-neutral-400 transition hover:border-neutral-700"
            >
              Back
            </button>
          )}
          <button
            onClick={() => setStep((s) => (s + 1) as StepIndex)}
            disabled={!canLeave[step]}
            className="rounded-full bg-neutral-50 px-5 py-2 text-xs font-medium text-neutral-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {step === 2 ? "Build it" : "Continue"}
          </button>
        </div>
      )}
        </div>

        {/* Present from the first keystroke, not saved for the end. Watching
            it come together as you decide what it is makes the form the
            build rather than a gate in front of one. */}
        <aside className="lg:sticky lg:top-12 lg:self-start">
          <Assembly stage={stage} working={working} className="w-full" />
          <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-wider text-neutral-700">
            {stage >= STAGES ? `${form.label}.harness.eth` : `${stage} of ${STAGES} assembled`}
          </p>
        </aside>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh px-8 py-12 lg:px-16">{children}</div>;
}

/** Where you are, and how much is left. */
function Rail({ step, onJump }: { step: StepIndex; onJump: (i: StepIndex) => void }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((name, i) => {
        const state = i < step ? "done" : i === step ? "here" : "ahead";
        return (
          <li key={name} className="flex flex-1 items-center gap-2">
            <button
              onClick={() => onJump(i as StepIndex)}
              disabled={state === "ahead"}
              className={`flex items-center gap-2 text-xs transition ${
                state === "here"
                  ? "text-neutral-100"
                  : state === "done"
                    ? "text-neutral-500 hover:text-neutral-300"
                    : "cursor-default text-neutral-700"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
                  state === "here"
                    ? "border-neutral-400 text-neutral-100"
                    : state === "done"
                      ? "border-neutral-700 text-neutral-500"
                      : "border-neutral-800 text-neutral-700"
                }`}
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              {name}
            </button>
            {i < STEPS.length - 1 && (
              <span className={`h-px flex-1 ${i < step ? "bg-neutral-700" : "bg-neutral-900"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// --- step 1 ----------------------------------------------------------------

function Identity({
  form,
  set,
  error,
}: {
  form: ProvisionRequest;
  set: (c: Partial<ProvisionRequest>) => void;
  error: string | null;
}) {
  return (
    <Section
      title="What it is called"
      blurb="The machine takes a name under harness.eth, and its first agent takes one under that. Both are minted on chain when you sign."
    >
      <Field label="Machine" hint="lower case, numbers, hyphens">
        <input
          autoFocus
          value={form.label}
          onChange={(e) => set({ label: e.target.value.toLowerCase().trim() })}
          placeholder="acme"
          className={input}
        />
      </Field>
      {error && <p className="text-xs text-amber-400/90">{error}</p>}

      <Field label="First agent">
        <input
          value={form.agent}
          onChange={(e) => set({ agent: e.target.value.toLowerCase().trim() })}
          placeholder="runner"
          className={input}
        />
      </Field>

      <div className="rounded-lg border border-neutral-900 bg-neutral-950/60 p-4">
        <p className="text-[10px] uppercase tracking-wider text-neutral-600">Names it will hold</p>
        <p className="mt-2 font-mono text-sm text-neutral-300">
          {form.label || "…"}.harness.eth
        </p>
        <p className="font-mono text-sm text-neutral-400">
          {form.agent || "…"}.{form.label || "…"}.harness.eth
        </p>
        <p className="mt-3 text-xs leading-relaxed text-neutral-600">
          The agent name resolves to the machine for exactly as long as the chain says it
          should — and stops the moment you revoke, for every client, not just ours.
        </p>
      </div>
    </Section>
  );
}

// --- step 2 ----------------------------------------------------------------

function Capabilities({
  form,
  set,
}: {
  form: ProvisionRequest;
  set: (c: Partial<ProvisionRequest>) => void;
}) {
  const chosen = form.capabilities ?? [];
  const custom = form.customRules ?? [];

  const toggle = (id: string) =>
    set({ capabilities: chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id] });

  const groups = [
    { key: "payments" as const, title: "Payments", blurb: "Moving a token. The executor settles these." },
    { key: "defi" as const, title: "DeFi", blurb: "Permitted by the grant; not yet settleable." },
  ];

  return (
    <Section
      title="What it may do"
      blurb="A grant is a list of (contract, function) pairs and a spending ceiling. Anything not on the list is refused on chain, not by the agent's good behaviour."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ceiling" hint="US dollars per day">
          <input
            value={form.capUsd}
            onChange={(e) => set({ capUsd: e.target.value.replace(/[^0-9.]/g, "") })}
            inputMode="decimal"
            className={input}
          />
        </Field>
        <Field label="Window" hint="days before the grant expires">
          <input
            value={form.days}
            onChange={(e) => set({ days: e.target.value.replace(/[^0-9]/g, "") })}
            inputMode="numeric"
            className={input}
          />
        </Field>
      </div>

      {groups.map((g) => (
        <div key={g.key}>
          <p className="mb-1 text-xs font-medium text-neutral-300">{g.title}</p>
          <p className="mb-3 text-xs text-neutral-600">{g.blurb}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {CATALOGUE.filter((c) => c.group === g.key).map((c) => {
              const on = chosen.includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className={`rounded-lg border p-3 text-left transition ${
                    on
                      ? "border-neutral-600 bg-neutral-900/70"
                      : "border-neutral-900 bg-neutral-950/40 hover:border-neutral-800"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm text-neutral-200">{c.name}</span>
                    <span
                      className={`h-3.5 w-3.5 shrink-0 rounded-sm border ${
                        on ? "border-neutral-400 bg-neutral-200" : "border-neutral-700"
                      }`}
                    />
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-neutral-600">
                    {c.detail}
                  </span>
                  <span className="mt-2 block font-mono text-[10px] text-neutral-700">
                    {c.selector} · {c.target.slice(0, 10)}…
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {!anyExecutable(chosen) && (
        <p className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-4 py-2.5 text-xs text-amber-300/90">
          Nothing chosen can be carried out yet. The grant will be valid and every call will
          revert at the executor. Add a payment capability unless that is what you meant.
        </p>
      )}

      <CustomRules rules={custom} onChange={(r) => set({ customRules: r })} />
    </Section>
  );
}

function CustomRules({
  rules,
  onChange,
}: {
  rules: CustomRule[];
  onChange: (r: CustomRule[]) => void;
}) {
  const [draft, setDraft] = useState<CustomRule>({ target: "", selector: "", note: "" });
  const problem = draft.target || draft.selector ? validateCustom(draft) : null;

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-neutral-300">Anything else</p>
      <p className="mb-3 text-xs leading-relaxed text-neutral-600">
        The catalogue is never complete, and the grant language does not care whether we
        thought of your contract. A target and a 4-byte selector is the whole rule.
      </p>

      {rules.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {rules.map((r, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-900 bg-neutral-950/40 px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate font-mono text-xs text-neutral-300">
                  {r.selector} → {r.target}
                </span>
                {r.note && <span className="block text-[11px] text-neutral-600">{r.note}</span>}
              </span>
              <button
                onClick={() => onChange(rules.filter((_, j) => j !== i))}
                className="shrink-0 text-xs text-neutral-600 transition hover:text-red-400"
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
        <input
          value={draft.target}
          onChange={(e) => setDraft({ ...draft, target: e.target.value.trim() })}
          placeholder="0x… contract"
          className={`${input} font-mono text-xs`}
        />
        <input
          value={draft.selector}
          onChange={(e) => setDraft({ ...draft, selector: e.target.value.trim() })}
          placeholder="0xa9059cbb"
          className={`${input} font-mono text-xs`}
        />
        <button
          onClick={() => {
            if (validateCustom(draft)) return;
            onChange([...rules, draft]);
            setDraft({ target: "", selector: "", note: "" });
          }}
          disabled={!!validateCustom(draft)}
          className="rounded-lg border border-neutral-800 px-4 text-xs text-neutral-300 transition hover:border-neutral-700 disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {problem && <p className="mt-2 text-xs text-amber-400/90">{problem}</p>}
    </div>
  );
}

// --- step 3 ----------------------------------------------------------------

const BRAINS = [
  { id: "claude-plan", name: "Claude Code", hint: "an OAuth token from an existing plan" },
  { id: "claude-key", name: "Claude, API key", hint: "sk-ant-…" },
  { id: "codex-key", name: "Codex", hint: "an OpenAI key" },
  { id: "none", name: "No brain", hint: "a shell and the tools, nothing driving them" },
] as const;

function Secrets({
  form,
  set,
}: {
  form: ProvisionRequest;
  set: (c: Partial<ProvisionRequest>) => void;
}) {
  return (
    <Section
      title="What it knows"
      blurb="Everything here is sealed under your Key Ring before it touches the disk. It rests as ciphertext, and removing this host from the ring retires all of it at once."
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {BRAINS.map((b) => (
          <button
            key={b.id}
            onClick={() => set({ brain: b.id })}
            className={`rounded-lg border p-3 text-left transition ${
              form.brain === b.id
                ? "border-neutral-600 bg-neutral-900/70"
                : "border-neutral-900 bg-neutral-950/40 hover:border-neutral-800"
            }`}
          >
            <span className="block text-sm text-neutral-200">{b.name}</span>
            <span className="mt-0.5 block text-xs text-neutral-600">{b.hint}</span>
          </button>
        ))}
      </div>

      {form.brain !== "none" && (
        <Field label="Token or key" hint="sealed, never stored in this browser">
          <input
            type="password"
            value={form.brainSecret}
            onChange={(e) => set({ brainSecret: e.target.value })}
            placeholder="…"
            className={`${input} font-mono text-xs`}
          />
        </Field>
      )}

      <Field label="Other secrets" hint="one NAME=value per line">
        <textarea
          rows={4}
          value={form.extraSecrets}
          onChange={(e) => set({ extraSecrets: e.target.value })}
          placeholder={"STRIPE_KEY=sk_live_…\nDATABASE_URL=postgres://…"}
          className={`${input} font-mono text-xs`}
        />
      </Field>
    </Section>
  );
}

// --- step 4 ----------------------------------------------------------------

type Phase = "idle" | "ring" | "awaiting" | "chain" | "done" | "failed";

function Build({
  session,
  req,
  authority,
  onStage,
  onWorking,
  onDone,
}: {
  session: Session;
  req: ProvisionRequest;
  authority: Authority;
  /** The drawing lives on the page, so progress is reported rather than held. */
  onStage: (s: AssemblyStage) => void;
  onWorking: (w: boolean) => void;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [stage, setStage] = useState<AssemblyStage>(3);
  const [note, setNote] = useState("Two taps: one to make the ring, one to sign the chain.");
  const [error, setError] = useState<string | null>(null);
  const [upgraded, setUpgraded] = useState<boolean | null>(null);

  useEffect(() => onStage(stage), [stage, onStage]);
  useEffect(() => onWorking(phase === "ring" || phase === "chain"), [phase, onWorking]);

  useEffect(() => {
    fetch(`/api/delegate?address=${authority.address}`)
      .then((r) => r.json())
      .then((d) => setUpgraded(!!d.upgraded))
      .catch(() => setUpgraded(false));
  }, [authority.address]);

  async function ring() {
    setError(null);
    setPhase("ring");
    try {
      const out = await startRing(session, req, setNote);
      setStage(4);
      setPhase("awaiting");
      setNote(
        (out.outcome === "created" ? "Ring created. " : "Ring recognised. ") +
          "Open Ethereum on your device, then continue.",
      );
    } catch (err) {
      setPhase("failed");
      setError(err instanceof RejectedOnDevice ? "Declined on the device. Nothing was created." : explain(err));
    }
  }

  async function chain() {
    setError(null);
    setPhase("chain");
    try {
      const out = await finishOnChain({
        session,
        req,
        upgraded,
        say: (s) => {
          setNote(s);
          // The signing steps are the last stretch; move the build on when
          // the device is actually being asked for something.
          if (/Ledger/i.test(s)) setStage((v) => (v < 5 ? 5 : v));
        },
        onPartial: () => setStage((v) => (v < 5 ? 5 : v)),
      });
      setStage(6);
      setPhase("done");
      setNote(`${req.agent}.${req.label}.harness.eth is live.`);
      await saveTenant(authority.address, 0, {
        label: req.label,
        registry: out.registry,
        meshAddress: out.meshAddress,
        agent: req.agent,
        agentId: out.agentId,
        cap: `$${req.capUsd}/day`,
        status: "live",
      });
    } catch (err) {
      setPhase("failed");
      setError(err instanceof RejectedOnDevice ? "Declined on the device. Nothing was created." : explain(err));
    }
  }

  const ringState = phase === "ring" ? "live" : stage >= 4 && phase !== "idle" ? "done" : "waiting";
  const chainState = phase === "chain" ? "live" : stage >= STAGES ? "done" : "waiting";

  return (
    <Section
          title="Build it"
          blurb="The ring is made once and cannot be unmade. The chain half can be retried as often as you like."
        >
          <Two
            n={1}
            name="Key Ring"
            detail="Your Ledger creates or recognises its ring and admits this host. Confirm in Ledger Sync."
            state={ringState}
          />
          <Two
            n={2}
            name="Ethereum app"
            detail={
              upgraded
                ? "One signature for all four calls, batched through your upgraded account."
                : "Four signatures: executor, host record, allowance, ceiling."
            }
            state={chainState}
          />

          <p className="text-sm text-neutral-400" role="status" aria-live="polite">
            {note}
          </p>
          {error && (
            <p className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-4 py-2.5 text-sm text-amber-300/90">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            {(phase === "idle" || (phase === "failed" && stage < 4)) && (
              <button onClick={ring} className={primary}>
                Start — make the ring
              </button>
            )}
            {(phase === "awaiting" || (phase === "failed" && stage >= 4)) && (
              <button onClick={chain} className={primary}>
                Continue in Ethereum →
              </button>
            )}
            {phase === "done" && (
              <button onClick={onDone} className={primary}>
                See your machines →
              </button>
            )}
          </div>
    </Section>
  );
}

function Two({
  n,
  name,
  detail,
  state,
}: {
  n: number;
  name: string;
  detail: string;
  state: "waiting" | "live" | "done";
}) {
  return (
    <div className="flex gap-3">
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${
          state === "done"
            ? "border-emerald-900/70 text-emerald-400/90"
            : state === "live"
              ? "step-live border-neutral-400 text-neutral-100"
              : "border-neutral-800 text-neutral-600"
        }`}
      >
        {state === "done" ? "✓" : n}
      </span>
      <span>
        <span className={`block text-sm ${state === "waiting" ? "text-neutral-500" : "text-neutral-200"}`}>
          {name}
        </span>
        <span className="block text-xs leading-relaxed text-neutral-600">{detail}</span>
      </span>
    </div>
  );
}

// --- furniture -------------------------------------------------------------

const input =
  "w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-700 focus:border-neutral-600";

const primary =
  "rounded-full bg-neutral-50 px-5 py-2 text-xs font-medium text-neutral-950 transition hover:bg-white";

function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-medium tracking-tight text-neutral-100">{title}</h2>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-neutral-600">{blurb}</p>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-neutral-300">{label}</span>
        {hint && <span className="text-[11px] text-neutral-600">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
