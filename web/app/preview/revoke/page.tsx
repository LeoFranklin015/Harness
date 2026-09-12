"use client";

import { useState } from "react";
import { HoldToRevoke } from "@/components/tenants/TenantSlot";

/** The hold-to-revoke control on its own, so its timing can be watched. */
export default function Preview() {
  const [done, setDone] = useState(0);
  return (
    <div className="min-h-dvh px-8 py-16">
      <div className="mx-auto max-w-md">
        <HoldToRevoke onRevoke={() => setDone((n) => n + 1)} />
        <p className="mt-4 font-mono text-xs text-neutral-600">fired {done}×</p>
      </div>
    </div>
  );
}
