"""The architecture, in the layout it was sketched in.

Same visual language as architecture.svg — dashed zones, tracked uppercase
labels, solid nested panels, numbered arrows — rearranged into four regions in
one frame, with the loop leaving the terminal, going round the outside and
coming back to the device.

Brand marks are nested whole, so this file has no external references.
"""

import os
import re

W, H = 1400, 840
BG = "#08090a"
INK = "#eef2f8"
SUB = "#8d97a6"

GREY = "#3a414c"
AMBER = "#e8a33d"
SKY = "#5fb3e0"
VIOLET = "#9b8cf5"
TEAL = "#4fd1c0"

LOGOS = "/home/opc/hackathon/web/public/logos"
out = []
add = out.append
esc = lambda t: t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def logo(name, cx, cy, h):
    raw = open(os.path.join(LOGOS, f"{name}.svg")).read()
    # The prolog has its own ">", which is what the inner content is cut on.
    raw = re.sub(r"<\?xml[^>]*\?>", "", raw)
    raw = re.sub(r"<!DOCTYPE[^>]*>", "", raw)
    raw = re.sub(r"<title>.*?</title>", "", raw, flags=re.S)
    raw = raw[raw.index("<svg"):]
    vb = re.search(r'viewBox="([^"]+)"', raw)
    box = vb.group(1) if vb else "0 0 24 24"
    vw, vh = (float(v) for v in box.split()[2:])
    w = h * vw / vh
    fill = re.search(r'<svg[^>]*fill="([^"]+)"', raw)
    f = f' fill="{fill.group(1)}"' if fill else ""
    add(f'<svg x="{cx - w / 2:.1f}" y="{cy - h / 2:.1f}" width="{w:.1f}" height="{h}" '
        f'viewBox="{box}"{f}>{raw[raw.index(">") + 1 : raw.rindex("</svg>")]}</svg>')


def zone(x, y, w, h, label, stroke, note=None, dash="7 6", r=16):
    """A boundary, dashed, with a tracked label — as in the original."""
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="none" stroke="{stroke}" '
        f'stroke-opacity="0.5" stroke-width="1.4" stroke-dasharray="{dash}"/>')
    add(f'<text x="{x + 24}" y="{y + 32}" fill="{stroke}" font-size="13" font-weight="600" '
        f'letter-spacing="1.7">{esc(label)}</text>')
    if note:
        add(f'<text x="{x + 24}" y="{y + 52}" fill="{stroke}" fill-opacity="0.58" font-size="11.5">'
            f'{esc(note)}</text>')


def panel(x, y, w, h, title, sub, stroke, fill, size=16.5, r=11):
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" '
        f'stroke-opacity="0.75" stroke-width="1.3"/>')
    cx, mid = x + w / 2, y + h / 2
    add(f'<text x="{cx:.0f}" y="{mid - 3:.0f}" fill="{INK}" font-size="{size}" font-weight="600" '
        f'text-anchor="middle">{esc(title)}</text>')
    if sub:
        add(f'<text x="{cx:.0f}" y="{mid + 18:.0f}" fill="{stroke}" fill-opacity="0.8" '
            f'font-size="12.2" text-anchor="middle">{esc(sub)}</text>')


def arrow(pts, colour, label=None, at=None, anchor="middle", step=None, vertical=False):
    d = "M " + " L ".join(f"{x:.0f} {y:.0f}" for x, y in pts)
    add(f'<path d="{d}" fill="none" stroke="{colour}" stroke-opacity="0.9" stroke-width="1.8" '
        f'stroke-linejoin="round" marker-end="url(#m{colour[1:]})"/>')
    if label:
        lx, ly = at
        rot = f' transform="rotate(-90 {lx:.0f} {ly:.0f})"' if vertical else ""
        add(f'<text x="{lx:.0f}" y="{ly:.0f}" fill="{colour}" fill-opacity="0.92" font-size="12.4" '
            f'text-anchor="{anchor}"{rot}>{esc((str(step) + "  " if step else "") + label)}</text>')


def text(x, y, s, fill, size, weight=400, anchor="middle", opacity=1.0, mono=False, spacing=None):
    fam = ' font-family="ui-monospace, SFMono-Regular, Menlo, monospace"' if mono else ""
    ls = f' letter-spacing="{spacing}"' if spacing else ""
    add(f'<text x="{x:.0f}" y="{y:.0f}" fill="{fill}" fill-opacity="{opacity}" font-size="{size}" '
        f'font-weight="{weight}" text-anchor="{anchor}"{fam}{ls}>{esc(s)}</text>')


add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
    f'font-family="Inter, ui-sans-serif, system-ui, sans-serif">')
add("<defs>")
for c in (AMBER, SKY, VIOLET, TEAL):
    add(f'<marker id="m{c[1:]}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" '
        f'markerHeight="6.5" orient="auto-start-reverse">'
        f'<path d="M 0 0 L 10 5 L 0 10 z" fill="{c}"/></marker>')
add("</defs>")
add(f'<rect width="{W}" height="{H}" fill="{BG}"/>')

# =========================================================================
FX, FY, FW, FH = 56, 118, 1130, 672
add(f'<rect x="{FX}" y="{FY}" width="{FW}" height="{FH}" rx="26" fill="none" stroke="{GREY}" '
    f'stroke-width="1.8"/>')
PAD = 28

# --- top left: the ring ---------------------------------------------------
AX, AY, AW, AH = FX + PAD, FY + PAD, 604, 232
zone(AX, AY, AW, AH, "THE RING · ONCE", AMBER, "the key never leaves the device")

row = AY + 142
logo("ledger", AX + 106, row, 22)
text(AX + 106, row + 42, "holds the seed", SUB, 12, 400, "middle", 0.72)
for cx, name, note in ((AX + 318, "browser", "carries bytes, reads none"), (AX + 502, "broker", "speaks LKRP")):
    panel(cx - 82, row - 30, 164, 60, name, None, AMBER, "#2a1d08", size=16)
    text(cx, row + 42, note, SUB, 12, 400, "middle", 0.72)
arrow([(AX + 152, row), (AX + 230, row)], AMBER, "opens it", (AX + 191, row - 18), step="1")
arrow([(AX + 402, row), (AX + 418, row)], AMBER, "relays", (AX + 410, row - 18), step="2")

# --- top right: the chain -------------------------------------------------
BX, BY = AX + AW + 28, AY
BW, BH = FW - AW - 2 * PAD - 28, AH
zone(BX, BY, BW, BH, "ON CHAIN · ENSv2", SKY, "read at request time, never copied")

panel(BX + 24, BY + 66, 196, 58, "AgentResolver", "computed, stores none", SKY, "#0b2130", size=14.5)
panel(BX + 24, BY + 136, 196, 58, "AllowanceExecutor", "runs the call", SKY, "#0b2130", size=14.5)
EX, EY, EW, EH = BX + 240, BY + 66, BW - 264, 128
add(f'<rect x="{EX}" y="{EY}" width="{EW}" height="{EH}" rx="11" fill="#0b2130" stroke="{SKY}" '
    f'stroke-opacity="0.6" stroke-width="1.3"/>')
logo("ens", EX + 34, EY + 34, 28)
for i, (name, pad) in enumerate((("harness.eth", 0), ("└ acme.harness.eth", 12), ("└ runner", 26))):
    text(EX + 62 + pad, EY + 30 + i * 22, name, SKY, 11.5, 400, "start", 0.88, mono=True)

# --- bottom left: the host ------------------------------------------------
CX, CY = AX, AY + AH + 44
CW, CH = 604, FH - AH - 2 * PAD - 44
zone(CX, CY, CW, CH, "THE HOST · ON THE MESH", VIOLET, "no public address, no neighbours")

MX, MY = CX + 24, CY + 68
MW, MH = CW - 48, CH - 92
zone(MX, MY, MW, MH, "ACME.HARNESS.ETH", VIOLET, "its own container, its own network", dash="4 5", r=13)
panel(MX + 22, MY + 76, MW - 44, 62, "runner", "a key with no authority", VIOLET, "#191630", size=16)

KX, KY = MX + 22, MY + 156
KW, KH = MW - 44, 74
add(f'<rect x="{KX}" y="{KY}" width="{KW}" height="{KH}" rx="11" fill="none" stroke="{VIOLET}" '
    f'stroke-opacity="0.4" stroke-width="1.2" stroke-dasharray="4 5"/>')
text(KX + 18, KY + 22, "WHAT IT KNOWS", VIOLET, 10.5, 600, "start", 0.72, spacing=1.5)
for i, m in enumerate(("claude", "openai", "github")):
    logo(m, KX + KW / 2 - 62 + i * 62, KY + 50, 24)

# --- bottom right: a terminal ---------------------------------------------
TX, TY = CX + CW + 28, CY + 52
TW, TH = FW - CW - 2 * PAD - 28, 230
add(f'<rect x="{TX}" y="{TY}" width="{TW}" height="{TH}" rx="12" fill="#05070a" stroke="{TEAL}" '
    f'stroke-opacity="0.55" stroke-width="1.3"/>')
add(f'<path d="M{TX} {TY + 34} H{TX + TW}" stroke="{TEAL}" stroke-opacity="0.25" stroke-width="1.1"/>')
for i in range(3):
    add(f'<circle cx="{TX + 20 + i * 15}" cy="{TY + 17}" r="4" fill="{GREY}"/>')
text(TX + 78, TY + 22, "acme.harness.eth", SUB, 11.5, 400, "start", 0.7, mono=True)

lines = [
    ("$ ssh runner@acme.harness.eth", INK, 1.0),
    ("resolved over DNS · ok", SUB, 0.75),
    ("host key from the chain · ok", SUB, 0.75),
    ("fingerprint admitted · ok", SUB, 0.75),
    ("", SUB, 0),
    ("runner@acme:~$", TEAL, 0.9),
]
for i, (t, c, o) in enumerate(lines):
    if t:
        text(TX + 20, TY + 64 + i * 26, t, c, 12.5, 400, "start", o, mono=True)
add(f'<rect x="{TX + 138}" y="{TY + 64 + 5 * 26 - 11}" width="8" height="14" fill="{TEAL}" '
    f'fill-opacity="0.8"/>')
for i, d in enumerate(("laptop", "phone", "watch")):
    x = TX + 26 + i * 40
    y = TY + TH + 34
    if d == "laptop":
        add(f'<g stroke="{SUB}" stroke-opacity="0.65" stroke-width="1.4" fill="none">'
            f'<rect x="{x - 13}" y="{y - 11}" width="26" height="17" rx="2.5"/>'
            f'<path d="M{x - 18} {y + 11} H{x + 18}" stroke-linecap="round"/></g>')
    elif d == "phone":
        add(f'<g stroke="{SUB}" stroke-opacity="0.65" stroke-width="1.4" fill="none">'
            f'<rect x="{x - 6}" y="{y - 12}" width="12" height="23" rx="3"/></g>')
    else:
        add(f'<g stroke="{SUB}" stroke-opacity="0.65" stroke-width="1.4" fill="none">'
            f'<rect x="{x - 6}" y="{y - 6}" width="12" height="12" rx="3"/>'
            f'<path d="M{x - 3} {y - 6} V{y - 12} M{x + 3} {y - 6} V{y - 12} '
            f'M{x - 3} {y + 6} V{y + 12} M{x + 3} {y + 6} V{y + 12}" stroke-linecap="round"/></g>')
text(TX + 150, TY + TH + 38, "mobile · watch · laptop", SUB, 12, 400, "start", 0.7)

# =========================================================================
# The arrows that cross.
# =========================================================================
arrow([(AX + 106, AY + AH + 2), (AX + 106, CY - 2)], AMBER,
      "seals what the agent knows", (AX + 120, CY - 18), "start", step="3")

LANE = CY + 18
arrow([(CX + CW + 2, LANE), (BX + 104, LANE), (BX + 104, BY + BH + 2)], VIOLET,
      "asks, every call", (CX + CW + 16, LANE - 12), "start", step="4")

arrow([(TX + TW / 2, TY - 2), (TX + TW / 2, BY + BH + 2)], TEAL,
      "over the name", (TX + TW / 2 + 12, TY - 24), "start", step="5")

LOOP_X, LOOP_TOP = 1258, 58
arrow([(TX + TW + 2, TY + TH / 2), (LOOP_X, TY + TH / 2), (LOOP_X, LOOP_TOP),
       (AX + 106, LOOP_TOP), (AX + 106, AY - 4)], AMBER)
add(f'<text x="{LOOP_X + 26}" y="{(LOOP_TOP + TY + TH / 2) / 2:.0f}" fill="{AMBER}" '
    f'fill-opacity="0.9" font-size="14.5" text-anchor="middle" '
    f'transform="rotate(-90 {LOOP_X + 26} {(LOOP_TOP + TY + TH / 2) / 2:.0f})">human in the loop</text>')
text(LOOP_X - 330, LOOP_TOP - 14, "over the ceiling, the agent stops and asks a person",
     AMBER, 12.4, 400, "middle", 0.68)

add("</svg>")
open("/home/opc/hackathon/docs/diagrams/architecture-slide.svg", "w").write("\n".join(out))
print("ok")
