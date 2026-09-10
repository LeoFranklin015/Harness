"use client";

import { useState } from "react";

export type ProvisionRequest = {
  label: string;
  agent: string;
  capUsd: string;
  days: string;
  sshFingerprint: string;
};

/**
 * What has to be known before a machine can exist.
 *
 * Everything here is asked once and then fixed on chain, so the form is the
 * last moment any of it is editable. It asks for a fingerprint rather than a
 * public key on purpose: the chain publishes what it is given, and an
 * authorized-key list published permanently is a roster of who can log in.
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
    sshFingerprint: "",
  });

  if (!open) return null;

  const labelError = validateLabel(form.label, taken);
  const fpError = validateFingerprint(form.sshFingerprint);
  const ready = !labelError && !fpError && form.agent.length > 0;

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
          A tenant is a machine and the device that speaks for it. This one will
          answer to the Ledger you just connected.
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

          <Field
            label="Your SSH key fingerprint"
            hint={fpError ?? "ssh-keygen -lf ~/.ssh/id_ed25519.pub | awk '{print $2}'"}
            error={!!fpError && form.sshFingerprint.length > 0}
          >
            <input
              value={form.sshFingerprint}
              onChange={(e) => setForm({ ...form, sshFingerprint: e.target.value.trim() })}
              placeholder="SHA256:…"
              className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-xs text-neutral-100 outline-none focus:border-neutral-600"
            />
          </Field>
          <p className="text-xs leading-relaxed text-neutral-600">
            The fingerprint, not the key. It is published on chain so the machine
            can check a key that is offered — publishing the key itself would
            publish a list of who may log in, permanently.
          </p>
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
  if (!/^[a-z0-9-]+$/.test(label)) return "Letters, digits and hyphens only";
  if (label.length < 3) return "At least three characters";
  if (taken.includes(label)) return "That name is already taken";
  return null;
}

function validateFingerprint(fp: string): string | null {
  if (!fp) return null;
  if (!/^SHA256:[A-Za-z0-9+/]{43}$/.test(fp)) {
    return "Expected SHA256: followed by 43 characters";
  }
  return null;
}
