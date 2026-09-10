"use client";

/**
 * A little movement behind everything.
 *
 * One soft silver mass, drifting slowly — a page that is completely still reads
 * as a screenshot. The drift is a 46-second loop so it is never caught moving;
 * it is only ever somewhere slightly different from where it was.
 */
export function Blob() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute left-1/2 top-1/2 h-[68vmax] w-[68vmax] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(205,210,218,0.13), rgba(205,210,218,0.05) 45%, transparent 72%)",
          filter: "blur(40px)",
          animation: "blobDrift 46s ease-in-out infinite alternate",
        }}
      />
      <div
        className="absolute left-1/2 top-1/2 h-[42vmax] w-[42vmax] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(255,255,255,0.07), transparent 70%)",
          filter: "blur(30px)",
          animation: "blobDrift 61s ease-in-out infinite alternate-reverse",
        }}
      />
    </div>
  );
}
