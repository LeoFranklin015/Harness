"use client";

import { Bento } from "@/components/hero/Bento";
import { Blob } from "@/components/hero/Blob";

/** The bento on its own, cards already arrived, so it can be reviewed. */
export default function Preview() {
  return (
    <div className="relative mx-auto max-w-[1320px] px-6 py-16">
      <Blob />
      <Bento visible />
    </div>
  );
}
