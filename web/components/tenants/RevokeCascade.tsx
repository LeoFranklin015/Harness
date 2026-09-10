"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * What revoking actually did, as it happens.
 *
 * The claim this whole system rests on is that one transaction ends
 * everything an Agent has, and that nothing is retracted or cleaned up
 * afterwards — spending, the name, the shell and the credentials all stop
 * because each is computed from the same fact on chain. Told as a sentence
 * that is a promise. Shown as four things failing in sequence, it is the
 * shape of the mechanism: not four teardowns, one fact with four readers.
 *
 * The stagger is doing the explaining, so it is slow enough to read as
 * consequence rather than as a list appearing. The order is the order a
 * person would care about: the money first, then reachability, then the
 * shell somebody may be sitting in, then what the machine gets handed on
 * restart.
 */

const SURFACES = [
  { name: "Spending", detail: "the executor refuses" },
  { name: "Name resolution", detail: "no address to publish" },
  { name: "Shell access", detail: "no key matches" },
  { name: "Credentials", detail: "not handed back" },
] as const;

const EASE = [0.22, 1, 0.36, 1] as const;

export function RevokeCascade({ name }: { name: string }) {
  const still = useReducedMotion();

  return (
    <div className="mt-6">
      <motion.ul
        initial="waiting"
        animate="cut"
        variants={{
          cut: { transition: { staggerChildren: still ? 0 : 0.28, delayChildren: still ? 0 : 0.15 } },
        }}
        className="space-y-2"
      >
        {SURFACES.map((s) => (
          <motion.li
            key={s.name}
            variants={{
              waiting: { opacity: 1 },
              cut: { opacity: 1 },
            }}
            className="relative flex items-baseline justify-between gap-4 text-xs"
          >
            <span className="relative text-neutral-500">
              {s.name}
              {/* Drawn rather than a strikethrough class: the line travelling
                  across the word is the part that reads as something being
                  cut, and it has to be able to take its own time. */}
              <motion.span
                aria-hidden
                variants={{
                  waiting: { scaleX: 0 },
                  cut: { scaleX: 1 },
                }}
                transition={{ duration: still ? 0 : 0.45, ease: EASE }}
                style={{ originX: 0 }}
                className="absolute left-0 top-1/2 h-px w-full bg-neutral-600"
              />
            </span>
            <motion.span
              variants={{
                waiting: { opacity: 0, y: -2 },
                cut: { opacity: 1, y: 0 },
              }}
              transition={{ duration: still ? 0 : 0.3, ease: EASE, delay: still ? 0 : 0.25 }}
              className="shrink-0 font-mono text-[10px] text-neutral-600"
            >
              {s.detail}
            </motion.span>
          </motion.li>
        ))}
      </motion.ul>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: still ? 0 : 1.5, duration: 0.5 }}
        className="mt-5 text-xs leading-relaxed text-neutral-600"
      >
        Nothing was restarted and nothing was cleaned up.{" "}
        <span className="font-mono text-neutral-500">{name}</span> stopped
        being answered for, in one transaction.
      </motion.p>
    </div>
  );
}
