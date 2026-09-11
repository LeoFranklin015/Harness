"use client";

import { UpgradeAccount } from "@/components/ledger/UpgradeAccount";

/** The 7702 offer, with no device in the loop, so it can be screenshotted. */
export default function Preview() {
  return (
    <div className="min-h-dvh px-8 py-14 lg:px-20">
      <h1 className="text-2xl font-medium tracking-tight text-neutral-50">Your machines</h1>
      <UpgradeAccount
        appVersion="1.22.1"
        busy={false}
        step={null}
        error={null}
        onUpgrade={() => {}}
        onSkip={() => {}}
      />
    </div>
  );
}
