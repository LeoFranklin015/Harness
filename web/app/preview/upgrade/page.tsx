"use client";

import { UpgradeAccount } from "@/components/ledger/UpgradeAccount";

/** The 7702 offer, with no device in the loop, so it can be screenshotted. */
export default function Preview() {
  return (
    <UpgradeAccount
      address="0xE0824f0D1f7E4a7C6B5F0a9e2c3D4b5A6c7D8e90"
      appVersion="1.22.1"
      busy={false}
      step={null}
      error={null}
      onUpgrade={() => {}}
      onSkip={() => {}}
    />
  );
}
