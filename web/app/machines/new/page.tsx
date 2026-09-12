"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
  /** 1 forward, -1 back. The step animation reads this so the motion agrees
      with the button that caused it. */
  const [dir, setDir] = useState(1);
  /** Reported up out of the build step, so the picture lives in the same rail
      the summary did rather than in a second grid inside the first. */
  const [build, setBuild] = useState<{
    stage: AssemblyStage;
    working: boolean;
    note: string;
    done: boolean;
  }>({ stage: 1, working: false, note: "", done: false });
  const go = (next: StepIndex) => {
    setDir(next > step ? 1 : -1);
    setStep(next);
  };


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

  // These have to agree with /api/provision exactly. When they did not, a
  // two-letter name passed here and came back as a bare 400 after the ring
  // had already been made — the worst possible moment to find out.
  const labelError = useMemo(() => {
    if (!form.label) return null;
    if (!LABEL_OK.test(form.label)) return "Lower case letters, numbers and hyphens.";
    if (form.label.length < 3) return "At least three characters.";
    if (taken.includes(form.label)) return "You already have a machine with that name.";
    return null;
  }, [form.label, taken]);

  // The agent name has the same rule as the machine name and reaches the
  // same places — a shell argv, a path, an ENS label. Keeping the two checks
  // in one place is the only way they stay in step with the route.
  const agentError = useMemo(() => {
    if (!form.agent) return "Give the first agent a name.";
    if (!LABEL_OK.test(form.agent)) return "Lower case letters, numbers and hyphens.";
    if (form.agent.length < 3) return "At least three characters.";
    return null;
  }, [form.agent]);

  const canLeave: Record<StepIndex, boolean> = {
    0: !!form.label && !labelError && !agentError,
    1: Number(form.capUsd) > 0 && Number(form.days) > 0,
    2: form.brain === "none" || form.brainSecret.trim().length > 0,
    3: true,
  };

  if (authority === undefined) return null;
  // Someone who lands here directly, or after clearing the browser. A machine
  // is rooted in a device, so there is nothing to fill in until there is one.
  if (!authority) {
    return (
      <Shell>
        <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center text-center">
          <div className="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
            <span className="h-px w-8 bg-neutral-700" />
            Harness
          </div>
          <h1 className="text-xl font-medium tracking-tight text-neutral-50">
            No device in this browser
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-neutral-500">
            A machine is rooted in a Ledger, and there is nothing to set up
            until one is connected.
          </p>
          <button
            onClick={() => router.push("/")}
            className="mt-6 rounded-full bg-neutral-50 px-5 py-2 text-sm font-medium text-neutral-950 transition hover:bg-white"
          >
            Connect a Ledger
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* A band across the top, so the page has a lid rather than starting
          in mid-air. */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-900 pb-6">
        <div>
          <button
            onClick={() => router.push("/")}
            className="mb-3 text-xs text-neutral-600 transition hover:text-neutral-400"
          >
            ← Your machines
          </button>
          <h1 className="text-2xl font-medium tracking-tight text-neutral-50">A new machine</h1>
        </div>
        <p className="pb-1 text-xs text-neutral-600">
          signed by <span className="font-mono text-neutral-500">{short(authority.address)}</span>
        </p>
      </header>

      {/* Two columns the whole way through: what you are filling in, and what
          it is adding up to. The right side used to be nothing at all, which
          left a form floating in a page four times its size. */}
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_306px] lg:gap-12">
        <div className="min-w-0">
          <Rail step={step} onJump={(i) => i < step && go(i)} />

          {step === 3 && session ? (
            // The same surface as the three steps before it. Left bare, the
            // last screen read as the page having run out rather than as the
            // step you had arrived at.
            <section className="step-in mt-8 rounded-2xl border border-neutral-900 bg-neutral-950/40 p-7">
              <Build
                session={session}
                req={form}
                authority={authority}
                onProgress={setBuild}
                onDone={() => router.push("/")}
              />
            </section>
          ) : (
            <section className="mt-8 rounded-2xl border border-neutral-900 bg-neutral-950/40 p-7">
              <div key={step} className={dir > 0 ? "step-in" : "step-in step-in-back"}>
                {step === 0 && <Identity form={form} set={set} error={labelError ?? agentError} />}
                {step === 1 && <Capabilities form={form} set={set} />}
                {step === 2 && <Secrets form={form} set={set} />}
              </div>

              <div className="mt-8 flex items-center justify-between border-t border-neutral-900 pt-6">
                <button
                  onClick={() => go((step - 1) as StepIndex)}
                  disabled={step === 0}
                  className="rounded-full border border-neutral-800 px-5 py-2 text-xs text-neutral-400 transition hover:border-neutral-700 disabled:pointer-events-none disabled:opacity-0"
                >
                  Back
                </button>
                <button
                  onClick={() => go((step + 1) as StepIndex)}
                  disabled={!canLeave[step]}
                  className="rounded-full bg-neutral-50 px-6 py-2 text-xs font-medium text-neutral-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {step === 2 ? "Build it" : "Continue"}
                </button>
              </div>
            </section>
          )}
        </div>

        {step < 3 ? (
          <Ledgerside form={form} step={step} />
        ) : (
          <aside className="lg:sticky lg:top-10 lg:self-start">
            <Assembly stage={build.stage} working={build.working} className="w-full" />
            {build.stage >= STAGES && (
              <p className="mt-3 text-center font-mono text-[11px] tracking-wider text-neutral-500">
                {form.label}.harness.eth
              </p>
            )}
          </aside>
        )}
      </div>

      {/* Outside the grid: it is fixed to the viewport, and an animated
          ancestor would make it fixed to that ancestor instead. */}
      {step === 3 && build.note && (
        <Saying note={build.note} working={build.working} done={build.done} />
      )}
    </Shell>
  );
}

/**
 * What the form adds up to, beside the form.
 *
 * A wizard asks four screens of questions and shows you one at a time, which
 * makes it easy to lose track of what you have already said. This is the
 * answer so far, in one place, filling in as you go — and it is also what
 * stops the page being a narrow column in an empty room.
 *
 * Nothing here is editable. It is a receipt, not a second form.
 */
function Ledgerside({ form, step }: { form: ProvisionRequest; step: StepIndex }) {
  const machine = form.label.trim();
  const agent = form.agent.trim();
  const tokens = form.tokens ?? [];
  const actions = form.actions ?? [];
  const protocols = form.protocols ?? [];
  const custom = form.customRules ?? [];
  const rules = tokens.length * actions.length + protocols.length + custom.length;
  const extras = form.extraSecrets.split("\n").filter((l) => l.includes("=")).length;

  const brain =
    form.brain === "none"
      ? null
      : form.brain === "claude-plan"
        ? "Claude sign-in"
        : form.brain === "claude-key"
          ? "Claude API key"
          : "Codex key";

  return (
    <aside className="lg:sticky lg:top-10 lg:self-start">
      <div className="overflow-hidden rounded-2xl border border-neutral-900 bg-neutral-950/60">
        <div className="border-b border-neutral-900 px-5 py-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-neutral-600">
            The machine
          </p>
          <p className="mt-2 break-all font-mono text-[13px] text-neutral-200">
            {machine ? `${machine}.harness.eth` : <span className="text-neutral-700">….harness.eth</span>}
          </p>
          <p className="mt-1 break-all font-mono text-[12px] text-neutral-500">
            {machine && agent ? `${agent}.${machine}.harness.eth` : <span className="text-neutral-800">the agent under it</span>}
          </p>
        </div>

        {/* A row appears once you have been through the screen that sets it.
            Showing the ceiling on the naming step was stating a decision
            nobody had made — those are defaults in a form field, not answers,
            and a summary that reports them is lying about what has been
            settled. */}
        <dl className="divide-y divide-neutral-900 text-[13px]">
          {step >= 1 && (
            <>
              <Line label="Ceiling" value={form.capUsd ? `$${form.capUsd} a day` : null} />
              <Line label="Window" value={form.days ? `${form.days} days` : null} />
              <Line label="Rules" value={rules ? `${rules} on the grant` : null} />
            </>
          )}
          {step >= 2 && (
            <Line
              label="Knows"
              value={[brain, extras ? `${extras} more` : null].filter(Boolean).join(" · ") || null}
            />
          )}
          {step === 0 && (
            <p className="px-5 py-4 text-[12px] leading-relaxed text-neutral-700">
              What it may spend and what it may know come next.
            </p>
          )}
        </dl>

        <p className="border-t border-neutral-900 px-5 py-4 text-[11px] leading-relaxed text-neutral-600">
          None of this exists yet. It is written on chain by the signature at
          the end, and one revoke takes all of it back.
        </p>
      </div>
    </aside>
  );
}

/** One row of the receipt. Dashes until there is something to say. */
function Line({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-3">
      <dt className="text-neutral-600">{label}</dt>
      <dd
        key={value ?? "-"}
        className={value ? "value-in text-right text-neutral-300" : "text-neutral-800"}
      >
        {value ?? "—"}
      </dd>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh px-6 py-10 lg:px-10">
      <div className="mx-auto w-full max-w-[1080px]">{children}</div>
    </div>
  );
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

      <p className="border-t border-neutral-900 pt-5 text-xs leading-relaxed text-neutral-600">
        The agent name resolves to the machine for exactly as long as the chain says it
        should — and stops the moment you revoke, for every client, not just ours.
      </p>
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
        {ruleCount === 0 ? (
          <span className="text-amber-400/90">
            With none of these it can hold a name and a shell, and spend nothing.
          </span>
        ) : (
          <span className="text-neutral-600">
            A protocol needs its approval chosen too, since that is how it is paid.
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
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  sub?: string;
  mono?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-left transition-colors duration-150 ease-snap ${
        on
          ? "border-neutral-500 bg-neutral-900"
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
  onProgress,
  onDone,
}: {
  session: Session;
  req: ProvisionRequest;
  authority: Authority;
  /** How far along, for the picture the page draws beside this. */
  onProgress: (p: {
    stage: AssemblyStage;
    working: boolean;
    note: string;
    done: boolean;
  }) => void;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [stage, setStage] = useState<AssemblyStage>(1);
  const [note, setNote] = useState("Two taps: one to make the ring, one to sign the chain.");
  const [error, setError] = useState<string | null>(null);
  const [upgraded, setUpgraded] = useState<boolean | null>(null);

  useEffect(() => {
    onProgress({
      stage,
      working: phase === "ring" || phase === "chain",
      note,
      done: phase === "done",
    });
  }, [stage, phase, note, onProgress]);

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
      // The machine exists on chain either way; this is the record that puts
      // it on the dashboard. Failing here silently is the worst outcome —
      // everything was built and nothing shows it — so say so.
      const notStored = await saveTenant(authority.address, 0, {
        label: req.label,
        registry: out.registry,
        meshAddress: out.meshAddress,
        agent: req.agent,
        agentId: out.agentId,
        cap: `$${req.capUsd}/day`,
        status: "live",
      });
      if (notStored) {
        setError(`${req.label} is live on chain, but the dashboard did not record it: ${notStored}`);
      }
    } catch (err) {
      setPhase("failed");
      setError(err instanceof RejectedOnDevice ? "Declined on the device. Nothing was created." : explain(err));
    }
  }

  const ringState = phase === "ring" ? "live" : stage >= 3 ? "done" : "waiting";
  const chainState = phase === "chain" ? "live" : stage >= STAGES ? "done" : "waiting";

  return (
    <>
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

    </>
  );
}

/**
 * What the machine is doing, at the bottom of the screen.
 *
 * It used to sit under the two numbered steps, where it read as a caption on
 * the step above rather than as the live thing it is. Down here it belongs to
 * the whole page, which is what it is about: the device, the host and the
 * chain, none of which are the step you happen to be looking at.
 *
 * Fixed rather than in the flow, because the one moment it matters most is
 * the moment somebody has looked away from the screen and down at the device.
 */
function Saying({ note, working, done }: { note: string; working: boolean; done: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-7 z-40 flex justify-center px-4">
      <p
        role="status"
        aria-live="polite"
        className={`flex max-w-[min(90vw,34rem)] items-center gap-2.5 rounded-full border px-5 py-2.5 text-sm backdrop-blur-md transition-colors ${
          done
            ? "border-emerald-900/60 bg-emerald-950/40 text-emerald-300/90"
            : "border-neutral-800 bg-neutral-950/80 text-neutral-300"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            done ? "bg-emerald-400" : working ? "saying-dot bg-sky-400" : "bg-neutral-600"
          }`}
        />
        <span className="truncate">{note}</span>
        {working && (
          <span className="shrink-0 text-neutral-500" aria-hidden>
            <span className="saying-ellipsis">.</span>
            <span className="saying-ellipsis">.</span>
            <span className="saying-ellipsis">.</span>
          </span>
        )}
      </p>
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
  "w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none transition-colors duration-150 ease-snap placeholder:text-neutral-700 focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500/60";

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
