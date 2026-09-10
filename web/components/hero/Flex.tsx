"use client";

import { useEffect, useState } from "react";

/**
 * A Ledger Flex, and the gesture that actually signs.
 *
 * No window around it: the other two things in the band are terminals, and this
 * is not one — it is an object on a desk. So it is drawn as the object, at the
 * proportions it has, and its screen runs the real interaction rather than a
 * still of one.
 *
 * The device asks you to *hold*, not tap, because a press you have to sustain
 * cannot happen by accident. That is the whole reason it is worth drawing: the
 * bar filling is a person deciding, and until it reaches the end nothing is
 * signed. Then the grant exists, and the name under it exists, and that is the
 * moment the rest of the page is downstream of.
 */

type Phase = "review" | "holding" | "signed";

/** How long each phase lasts. The hold is the device's own duration. */
const HOLD_MS = 1500;
const SIGNED_MS = 2600;
const REVIEW_MS = 1800;

export function Flex({ className = "" }: { className?: string }) {
  const [phase, setPhase] = useState<Phase>("review");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const next: Record<Phase, [Phase, number]> = {
      review: ["holding", REVIEW_MS],
      holding: ["signed", HOLD_MS],
      signed: ["review", SIGNED_MS],
    };
    const [to, ms] = next[phase];
    const id = setTimeout(() => setPhase(to), ms);
    return () => clearTimeout(id);
  }, [phase]);

  const holding = phase === "holding";
  const signed = phase === "signed";

  return (
    <div className={`relative ${className}`}>
      {/* The device casts a little light on whatever it is standing on. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-2 bottom-2 h-28 blur-2xl"
        style={{
          background: `radial-gradient(ellipse at 50% 100%, rgba(224,167,105,${signed ? 0.2 : 0.1}), transparent 70%)`,
          transition: "background 700ms",
        }}
      />

      <svg
        viewBox="0 0 150 214"
        className="relative mx-auto h-auto w-full max-w-[300px]"
        role="img"
        aria-label={
          signed
            ? "A Ledger Flex showing the grant signed"
            : "A Ledger Flex asking to hold to sign a ten dollar a day ceiling"
        }
      >
        <defs>
          {/* Stainless, as a gradient with a narrow bright band. */}
          <linearGradient id="flex-steel" x1="0" y1="0" x2="1" y2="0.2">
            <stop offset="0%" stopColor="#22262b" />
            <stop offset="18%" stopColor="#7b8794" />
            <stop offset="30%" stopColor="#2b3037" />
            <stop offset="52%" stopColor="#98a4b2" />
            <stop offset="66%" stopColor="#31363d" />
            <stop offset="86%" stopColor="#6b7683" />
            <stop offset="100%" stopColor="#1d2126" />
          </linearGradient>
          <linearGradient id="flex-glass" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor="#0d1013" />
            <stop offset="100%" stopColor="#040506" />
          </linearGradient>
        </defs>

        {/* Body: a machined frame with the screen almost flush to it. */}
        <rect x="5" y="5" width="140" height="204" rx="26" fill="url(#flex-steel)" opacity="0.55" />
        <rect
          x="7.5"
          y="7.5"
          width="135"
          height="199"
          rx="24"
          fill="#08090b"
          stroke="#dfe6ef"
          strokeOpacity="0.5"
          strokeWidth="1.2"
        />
        {/* The highlight only on the top-left arc, where a light above it lands. */}
        <path
          d="M 34 8.2 A 24 24 0 0 0 8.2 34"
          fill="none"
          stroke="#f4f8fd"
          strokeOpacity="0.7"
          strokeWidth="1.3"
        />
        {/* Power button, right edge. */}
        <rect x="142" y="66" width="5" height="30" rx="2.5" fill="url(#flex-steel)" stroke="#dfe6ef" strokeOpacity="0.35" strokeWidth="0.8" />

        <rect x="16" y="16" width="118" height="182" rx="18" fill="url(#flex-glass)" stroke="#dfe6ef" strokeOpacity="0.16" strokeWidth="0.9" />

        <g
          textAnchor="middle"
          style={{ fontFamily: "var(--font-mono), ui-monospace, monospace" }}
        >
          {signed ? (
            <>
              <circle cx="75" cy="72" r="19" fill="#e0a769" fillOpacity="0.14" stroke="#e0a769" strokeOpacity="0.9" strokeWidth="1.4" />
              <path
                d="M 66 72 L 72.5 78.5 L 85 65"
                fill="none"
                stroke="#e0a769"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="flex-tick"
              />
              <text x="75" y="112" fontSize="7.5" letterSpacing="1.6" fill="#e0a769">
                SIGNED
              </text>
              <line x1="34" y1="126" x2="116" y2="126" stroke="#dfe6ef" strokeOpacity="0.12" strokeWidth="0.8" />
              <text x="75" y="142" fontSize="6.6" fill="#c2ccda">
                runner.leo
              </text>
              <text x="75" y="152" fontSize="6.6" fill="#c2ccda">
                .harness.eth
              </text>
              <text x="75" y="172" fontSize="6" letterSpacing="1.2" fill="#6b7280">
                CEILING LIVE
              </text>
            </>
          ) : (
            <>
              <text x="75" y="42" fontSize="6.6" letterSpacing="1.5" fill="#8e99a8">
                REVIEW GRANT
              </text>
              <text x="75" y="80" fontSize="23" fill="#e0a769" letterSpacing="-0.6">
                $10.00
              </text>
              <text x="75" y="93" fontSize="6.2" letterSpacing="1.5" fill="#6b7280">
                PER DAY · 30 DAYS
              </text>

              <line x1="34" y1="106" x2="116" y2="106" stroke="#dfe6ef" strokeOpacity="0.12" strokeWidth="0.8" />

              <text x="75" y="120" fontSize="6.6" fill="#c2ccda">
                runner.leo
              </text>
              <text x="75" y="130" fontSize="6.6" fill="#c2ccda">
                .harness.eth
              </text>

              {/* Reject is always offered. Refusing is a first-class answer. */}
              <g>
                <rect x="27" y="150" width="42" height="24" rx="12" fill="none" stroke="#dfe6ef" strokeOpacity="0.26" strokeWidth="1" />
                <text x="48" y="165.5" fontSize="6.4" letterSpacing="1" fill="#8e99a8">
                  REJECT
                </text>
              </g>

              {/* Hold: the fill is the decision being made, and it is the only
                  thing that produces a signature. */}
              <g>
                <clipPath id="flex-hold-clip">
                  <rect x="81" y="150" width="42" height="24" rx="12" />
                </clipPath>
                <rect x="81" y="150" width="42" height="24" rx="12" fill="#e0a769" fillOpacity="0.1" />
                <g clipPath="url(#flex-hold-clip)">
                  <rect
                    x="81"
                    y="150"
                    height="24"
                    fill="#e0a769"
                    fillOpacity="0.55"
                    width={holding ? 42 : 0}
                    style={{
                      transition: holding ? `width ${HOLD_MS}ms linear` : "width 260ms ease-out",
                    }}
                  />
                </g>
                <rect x="81" y="150" width="42" height="24" rx="12" fill="none" stroke="#e0a769" strokeOpacity="0.95" strokeWidth="1.2" />
                <text x="102" y="165.5" fontSize="6.4" letterSpacing="1" fill={holding ? "#1a1206" : "#e0a769"}>
                  HOLD
                </text>
                {/* A thumb resting on the button while it fills. */}
                {holding && (
                  <circle cx="102" cy="162" r="13" fill="#f4d3ab" fillOpacity="0.1" stroke="#f4d3ab" strokeOpacity="0.35" strokeWidth="1" />
                )}
              </g>
            </>
          )}
        </g>
      </svg>

      <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">
        {signed ? "one signature · four calls" : "hold to sign · never a tap"}
      </p>
    </div>
  );
}
