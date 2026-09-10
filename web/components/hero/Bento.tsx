"use client";

import type { ReactNode } from "react";
import { Grain } from "./Grain";
import { FlexDevice } from "./FlexDevice";
import { IsoCube } from "./IsoCube";
import { TerminalAct } from "./TerminalAct";

/**
 * Three things, three cards.
 *
 * Each subject gets its own frame here, unlike the stage, because this section
 * is for reading rather than watching. The same dither draws all three, so they
 * still belong to one system: the device that grants, the boundary it grants
 * into, and the machine working inside it.
 */
export function Bento({ visible }: { visible: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card
        eyebrow="01 — the device"
        title="A ceiling you can read"
        body="The Ledger shows the agent, the cap and the expiry. What you approve is what is enforced — no summary, no hash."
        delay={0}
        visible={visible}
      >
        <Panel>
          <FlexDevice screen="approve" tilt scale={0.74} />
        </Panel>
      </Card>

      <Card
        eyebrow="02 — the boundary"
        title="A machine it authorised"
        body="Agents run on their own tenant, under their own device. Authority narrows on the way down and never crosses sideways."
        delay={120}
        visible={visible}
      >
        <Panel>
          <div style={{ perspective: 1400 }}>
            <div
              className="flex items-center justify-center"
              style={{ transformStyle: "preserve-3d", transform: "rotateX(-30deg) rotateY(-42deg) scale(0.8)" }}
            >
              <IsoCube tone="live" label="leo.harness.eth" agents={["research", "newsdesk"]} cap="$10.00 / day" />
            </div>
          </div>
        </Panel>
      </Card>

      <Card
        eyebrow="03 — the work"
        title="Spending, reachable, then stopped"
        body="A ring seals the keys. An agent pays through x402 and answers SSH. One transaction revokes all of it at once."
        delay={240}
        visible={visible}
      >
        <Panel padded={false}>
          <TerminalAct running={visible} height={300} />
        </Panel>
      </Card>
    </div>
  );
}

/**
 * The dark field each subject sits in. The card is the page's grey; this is
 * the black behind the thing itself — the reference frames its subject the same
 * way — and the grain lives here, over the subject, not over the words.
 */
function Panel({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  return (
    <div
      className={`relative mt-4 flex h-[300px] items-center justify-center overflow-hidden rounded-xl border border-white/[0.06] bg-[#050607] ${padded ? "p-4" : ""}`}
    >
      {children}
      <Grain opacity={0.2} px={2} />
    </div>
  );
}

function Card({
  eyebrow,
  title,
  body,
  delay,
  visible,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  delay: number;
  visible: boolean;
  children: ReactNode;
}) {
  return (
    <article
      className="group relative flex min-h-[470px] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0b0d]/80 p-6 backdrop-blur-sm transition-all duration-700"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(28px)",
        transitionDelay: `${delay}ms`,
      }}
    >
      {/* A hairline that brightens on hover: the only motion a card allows
          itself, so the page stays quiet. */}
      <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent opacity-40 transition-opacity duration-500 group-hover:opacity-90" />

      <p className="text-[10px] uppercase tracking-[0.24em] text-neutral-500">{eyebrow}</p>
      <h3 className="mt-3 text-[19px] font-medium leading-snug tracking-tight text-neutral-100">{title}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-neutral-500">{body}</p>

      <div className="flex-1">{children}</div>
    </article>
  );
}
