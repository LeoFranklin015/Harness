"use client";

import { useState } from "react";

export type ProvisionRequest = {
  label: string;
  agent: string;
  capUsd: string;
  days: string;
};

/**
 * What has to be known before a machine can exist — and nothing else.
 *
 * A name, a first agent, a ceiling. Everything here is fixed on chain by the
 * device's signature, so this is the last moment any of it is editable. What
 * is deliberately *not* here: who may SSH in. The machine starts with that door
 * shut, and opening it is a later decision about a machine you already have,
 * not a precondition for having one.
 */
export function ProvisionDialog({
  open,
  onClose,
  onSubmit,
  taken,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (req: ProvisionRequest) => void;
  taken: string[];
}) {
  const [form, setForm] = useState<ProvisionRequest>({
    label: "",
    agent: "runner",
    capUsd: "10",
    days: "30",
  });

  if (!open) return null;

  const labelError = validateLabel(form.label, taken);
  const ready = !labelError && form.label.length > 0 && /^[a-z0-9-]+$/.test(form.agent);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Add a machine"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-medium text-neutral-100">Add a machine</h2>
        <p className="mt-1 text-sm text-neutral-500">
          A machine, and an agent on it with a ceiling. It will answer to the
          Ledger you just connected — one confirmation to seal its keys, four
          to make it real.
        </p>

        <div className="mt-6 space-y-4">
          <Field
            label="Name"
            hint={labelError ?? `${form.label || "name"}.harness.eth`}
            error={!!labelError && form.label.length > 0}
          >
            <input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value.toLowerCase() })}
              placeholder="leo"
              autoFocus
              className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-sm text-neutral-100 outline-none focus:border-neutral-600"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="First agent" hint={`${form.agent || "agent"}.${form.label || "name"}.harness.eth`}>
              <input
                value={form.agent}
                onChange={(e) => setForm({ ...form, agent: e.target.value.toLowerCase() })}
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-sm text-neutral-100 outline-none focus:border-neutral-600"
              />
            </Field>

            <Field label="Ceiling" hint="USDC per day">
              <input
                value={form.capUsd}
                onChange={(e) => setForm({ ...form, capUsd: e.target.value })}
                inputMode="decimal"
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-sm text-neutral-100 outline-none focus:border-neutral-600"
              />
            </Field>
          </div>

          <Field label="Runs for" hint="days, then the agent's authority expires on its own">
            <input
              value={form.days}
              onChange={(e) => setForm({ ...form, days: e.target.value })}
              inputMode="numeric"
              className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-sm text-neutral-100 outline-none focus:border-neutral-600"
            />
          </Field>
        </div>

        <div className="mt-7 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200">
            Cancel
          </button>
          <button
            onClick={() => onSubmit(form)}
            disabled={!ready}
            className="rounded-full bg-neutral-50 px-5 py-2 text-sm font-medium text-neutral-950 transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            Provision
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs uppercase tracking-wider text-neutral-500">{label}</span>
      {children}
      {hint && (
        <span className={`mt-1.5 block truncate font-mono text-[11px] ${error ? "text-red-400/80" : "text-neutral-600"}`}>
          {hint}
        </span>
      )}
    </label>
  );
}

/** A label becomes a permanent ENS name, so it is checked before it is minted. */
function validateLabel(label: string, taken: string[]): string | null {
  if (!label) return null;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(label)) return "Letters, digits and hyphens; start with a letter or digit";
  if (label.length < 3) return "At least three characters";
  if (taken.includes(label)) return "That name is already taken";
  return null;
}
