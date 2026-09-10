"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Address } from "viem";

import { Assembly, STAGES, type AssemblyStage } from "@/components/provision/Assembly";
import type { ProvisionRequest } from "@/components/tenants/ProvisionDialog";
import {
  ACTIONS,
  DEFAULT_ACTIONS,
  DEFAULT_TOKENS,
  PROTOCOLS,
  TOKENS,
  isAddress,
  isSelector,
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


  const [form, setForm] = useState<ProvisionRequest>({
    label: "",
    agent: "runner",
    capUsd: "10",
    days: "30",
    brain: "claude-plan",
    brainSecret: "",
    extraSecrets: "",
    tokens: [...DEFAULT_TOKENS],
    actions: [...DEFAULT_ACTIONS],
    protocols: [],
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
      <header className="mb-10 mx-auto max-w-2xl">
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

      <div className="mx-auto max-w-2xl">
        <Rail step={step} onJump={(i) => i < step && setStep(i)} />
      </div>

      {/* A reading column, centred while it is alone on the page. The build
          step brings the machine and takes the full width for itself. */}
      <div className={`mt-12 ${step === 3 ? "" : "mx-auto max-w-2xl"}`}>
          {step === 0 && <Identity form={form} set={set} error={labelError} />}
          {step === 1 && <Capabilities form={form} set={set} />}
          {step === 2 && <Secrets form={form} set={set} />}
          {step === 3 && session && (
            <Build session={session} req={form} authority={authority} onDone={() => router.push("/")} />
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
  const tokens = form.tokens ?? [];
  const actions = form.actions ?? [];
  const protocols = form.protocols ?? [];
  const custom = form.customRules ?? [];

  const flip = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  const ruleCount = tokens.length * actions.length + protocols.length + custom.length;
  const settles = actions.some((a) => ACTIONS.find((x) => x.id === a)?.executable) && tokens.length > 0;

  return (
    <Section
      title="What it may do"
      blurb="A rule is a contract and a function. Pick what it may touch and what it may do with it — the two multiply, so three tokens and one action is three rules."
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

      {/* Protocols first and on one line, because they are the exception —
          a swap is not an action on a token, it is a call on a router, and
          pretending otherwise would force the whole grid to bend. */}
      <Row label="Protocols" hint="whole rules of their own">
        {PROTOCOLS.map((pr) => (
          <Chip
            key={pr.id}
            on={protocols.includes(pr.id)}
            onClick={() => set({ protocols: flip(protocols, pr.id) })}
            sub={pr.detail}
            warn
          >
            {pr.name}
          </Chip>
        ))}
      </Row>

      <Row label="Tokens" hint="what it may touch">
        {TOKENS.map((t) => (
          <Chip
            key={t.address}
            on={tokens.includes(t.address)}
            onClick={() => set({ tokens: flip(tokens, t.address) })}
          >
            {t.symbol}
          </Chip>
        ))}
        {tokens
          .filter((t) => !TOKENS.some((k) => k.address === t))
          .map((t) => (
            <Chip key={t} on onClick={() => set({ tokens: flip(tokens, t) })} mono>
              {t.slice(0, 8)}…
            </Chip>
          ))}
        <AddChip
          placeholder="0x… contract"
          check={isAddress}
          onAdd={(v) => set({ tokens: [...tokens, v] })}
        />
      </Row>

      <Row label="Actions" hint="what it may do with them">
        {ACTIONS.map((a) => (
          <Chip
            key={a.id}
            on={actions.includes(a.id)}
            onClick={() => set({ actions: flip(actions, a.id) })}
            sub={a.detail}
            warn={!a.executable}
          >
            {a.name}
          </Chip>
        ))}
        <AddChip
          placeholder="0xa9059cbb"
          check={isSelector}
          onAdd={(v) =>
            set({ customRules: [...custom, { target: tokens[0] ?? "", selector: v, note: "custom call" }] })
          }
        />
      </Row>

      {custom.length > 0 && (
        <Row label="Custom" hint="written out by hand">
          {custom.map((r, i) => (
            <Chip key={i} on mono onClick={() => set({ customRules: custom.filter((_, j) => j !== i) })}>
              {r.selector} → {r.target.slice(0, 8)}…
            </Chip>
          ))}
        </Row>
      )}

      <p className="border-t border-neutral-900 pt-4 text-xs text-neutral-500">
        <span className="text-neutral-300">{ruleCount}</span> rule{ruleCount === 1 ? "" : "s"} on
        the grant.{" "}
        {settles ? (
          <span className="text-neutral-600">The executor can settle transfers.</span>
        ) : (
          <span className="text-amber-400/90">
            Nothing here can be carried out yet — the grant will be valid and every call will
            revert at the executor.
          </span>
        )}
      </p>
    </Section>
  );
}

/** One labelled line of choices. */
function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-neutral-900 pt-4">
      <p className="mb-2.5 flex items-baseline gap-3">
        <span className="text-xs font-medium text-neutral-300">{label}</span>
        <span className="text-xs text-neutral-600">{hint}</span>
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
  sub,
  mono,
  warn,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  sub?: string;
  mono?: boolean;
  /** Permitted by the grant, but nothing can carry it out yet. */
  warn?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-left transition ${
        on
          ? warn
            ? "border-amber-900/60 bg-amber-950/20"
            : "border-neutral-500 bg-neutral-900"
          : "border-neutral-900 bg-neutral-950/40 hover:border-neutral-700"
      }`}
    >
      <span
        className={`block text-sm ${mono ? "font-mono text-xs" : ""} ${
          on ? "text-neutral-100" : "text-neutral-400"
        }`}
      >
        {children}
      </span>
      {sub && <span className="mt-0.5 block text-[11px] text-neutral-600">{sub}</span>}
    </button>
  );
}

/** The escape hatch on every row: the list is never complete. */
function AddChip({
  placeholder,
  check,
  onAdd,
}: {
  placeholder: string;
  check: (v: string) => boolean;
  onAdd: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-dashed border-neutral-800 px-3 py-2 text-sm text-neutral-500 transition hover:border-neutral-600 hover:text-neutral-300"
      >
        + custom
      </button>
    );
  }

  const ok = check(value);
  return (
    <span className="flex items-center gap-1">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value.trim())}
        onKeyDown={(e) => {
          if (e.key === "Enter" && ok) {
            onAdd(value);
            setValue("");
            setOpen(false);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        className="w-44 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-100 outline-none placeholder:text-neutral-700 focus:border-neutral-500"
      />
      <button
        onClick={() => {
          if (!ok) return;
          onAdd(value);
          setValue("");
          setOpen(false);
        }}
        disabled={!ok}
        className="rounded-lg border border-neutral-800 px-3 py-2 text-xs text-neutral-300 transition hover:border-neutral-600 disabled:opacity-40"
      >
        Add
      </button>
    </span>
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
  onDone,
}: {
  session: Session;
  req: ProvisionRequest;
  authority: Authority;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [stage, setStage] = useState<AssemblyStage>(1);
  const [note, setNote] = useState("Two taps: one to make the ring, one to sign the chain.");
  const [error, setError] = useState<string | null>(null);
  const [upgraded, setUpgraded] = useState<boolean | null>(null);

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
      setStage(3);
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
        onPartial: () => setStage((v) => (v < 4 ? 4 : v)),
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

  const ringState = phase === "ring" ? "live" : stage >= 3 ? "done" : "waiting";
  const chainState = phase === "chain" ? "live" : stage >= STAGES ? "done" : "waiting";

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-16">
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
            {(phase === "idle" || (phase === "failed" && stage < 3)) && (
              <button onClick={ring} className={primary}>
                Start — make the ring
              </button>
            )}
            {(phase === "awaiting" || (phase === "failed" && stage >= 3)) && (
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

      <aside className="lg:sticky lg:top-12 lg:self-start">
        <Assembly stage={stage} working={phase === "ring" || phase === "chain"} className="w-full" />
        <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-wider text-neutral-700">
          {stage >= STAGES ? `${req.label}.harness.eth` : `${stage} of ${STAGES} assembled`}
        </p>
      </aside>
    </div>
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
