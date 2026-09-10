"use client";

import { useState } from "react";
import { Machine } from "@/components/tenants/Machine";

/** The gear train on its own, large, with nothing to compete with it. */
export default function MachinePreview() {
  const [state, setState] = useState<"provisioning" | "live" | "revoked">("live");

  return (
    <div className="min-h-dvh px-8 py-14 lg:px-20">
      <div className="mb-6 flex gap-2">
        {(["provisioning", "live", "revoked"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setState(s)}
            className={`rounded-full border px-4 py-1.5 text-xs transition ${
              state === s
                ? "border-neutral-600 bg-neutral-900 text-neutral-100"
                : "border-neutral-800 text-neutral-500 hover:border-neutral-700"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex aspect-[16/10] w-full max-w-3xl items-center justify-center overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/60">
        <Machine state={state} className="h-[86%] w-[86%]" />
      </div>
    </div>
  );
}
