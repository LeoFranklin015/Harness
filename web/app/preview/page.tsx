"use client";

import { Hero } from "@/components/hero/Hero";

/**
 * The landing, with the device wired to nothing.
 *
 * Exists so the page can be screenshotted and judged without a Ledger in the
 * loop — see DESIGN.md for the headless rig.
 */
export default function Preview() {
  return (
    <Hero
      onConnect={() => {}}
      connecting={false}
      supported
      status={<p className="text-sm text-neutral-600">Unlock it and open the Ethereum app.</p>}
    />
  );
}
