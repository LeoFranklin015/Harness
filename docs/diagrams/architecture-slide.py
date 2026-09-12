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
for c in (AMBER, SKY, VIOLET, TEAL, "#e2615f"):
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
AX, AY, AW, AH = FX + PAD, FY + PAD, 500, 232
zone(AX, AY, AW, AH, "THE RING · ONCE", AMBER, "the key never leaves the device")

row = AY + 142
logo("ledger", AX + 88, row, 22)
text(AX + 88, row + 42, "holds the seed", SUB, 12, 400, "middle", 0.72)
for cx, name, note in ((AX + 246, "browser", "carries bytes"), (AX + 402, "broker", "speaks LKRP")):
    panel(cx - 70, row - 30, 140, 60, name, None, AMBER, "#2a1d08", size=16)
    text(cx, row + 42, note, SUB, 12, 400, "middle", 0.72)
arrow([(AX + 126, row), (AX + 172, row)], AMBER, "opens it", (AX + 149, row - 40), step="1")
arrow([(AX + 318, row), (AX + 330, row)], AMBER, "relays", (AX + 324, row - 40), step="2")

# --- top right: the chain -------------------------------------------------
BX, BY = AX + AW + 28, AY
BW, BH = FW - AW - 2 * PAD - 28, AH
zone(BX, BY, BW, BH, "ON CHAIN · ENSv2", SKY, "read at request time, never copied")

PW = 230
panel(BX + 22, BY + 60, PW, 62, "AgentResolver", "computed, stores none",
      SKY, "#0b2130", size=14)
panel(BX + 22, BY + 132, PW, 62, "AllowanceExecutor", "runs the call",
      SKY, "#0b2130", size=14)

NW = 252
NX, NY = BX + BW - 22 - NW, BY + 60
zone(NX, NY, NW, 152, "harness.eth", SKY, dash="5 5", r=12)
zone(NX + 14, NY + 40, NW - 28, 98, "acme.harness.eth", SKY, dash="4 5", r=11)
panel(NX + 28, NY + 76, NW - 56, 48, "runner.acme.harness.eth", None, SKY, "#0b2130", size=12.5, r=9)
logo("ens", NX + NW - 30, NY + 20, 22)

# --- bottom left: the mesh, and the machines on it ------------------------
CX, CY = AX, AY + AH + 44
CW, CH = 604, FH - AH - 2 * PAD - 44
zone(CX, CY, CW, CH, "TAILSCALE MESH", TEAL,
     "no public address, no open port · invites are single-use")

# The nameserver is what makes an .eth name something you can ssh to.
panel(CX + 24, CY + 60, CW - 48, 46, "Nameserver", "answers .eth over DNS",
      TEAL, "#07211f", size=14)

HX, HY = CX + 24, CY + 122
HW, HH = CW - 48, CH - 146
zone(HX, HY, HW, HH, "THE HOST · ONE VM", VIOLET, dash="7 6", r=14)

# Two tenants, side by side, each sealed off from the other.
MW, MH = 246, 152
for i, (name, agent) in enumerate((("ACME.HARNESS.ETH", "claude"),
                                   ("LEO.HARNESS.ETH", "openai"))):
    MX, MY = HX + 22 + i * (MW + 22), HY + 34
    zone(MX, MY, MW, MH, name, VIOLET, dash="4 5", r=12)
    panel(MX + 16, MY + 44, MW - 32, 46, "runner", "a key with no authority",
          VIOLET, "#191630", size=14)

    KX, KY = MX + 16, MY + 100
    KW, KH = MW - 32, 42
    add(f'<rect x="{KX}" y="{KY}" width="{KW}" height="{KH}" rx="10" fill="none" stroke="{VIOLET}" '
        f'stroke-opacity="0.4" stroke-width="1.2" stroke-dasharray="3 4"/>')
    text(KX + 14, KY + 26, "KNOWS", VIOLET, 10.5, 600, "start", 0.72, spacing=1.5)
    for j, m in enumerate((agent, "github")):
        logo(m, KX + KW - 62 + j * 34, KY + KH / 2, 19)

# --- bottom right: a terminal ---------------------------------------------
TX, TY = CX + CW + 56, CY + 44
TW, TH = FX + FW - PAD - TX, 214
add(f'<rect x="{TX}" y="{TY}" width="{TW}" height="{TH}" rx="12" fill="#05070a" stroke="{TEAL}" '
    f'stroke-opacity="0.55" stroke-width="1.3"/>')
add(f'<path d="M{TX} {TY + 32} H{TX + TW}" stroke="{TEAL}" stroke-opacity="0.25" stroke-width="1.1"/>')
for i in range(3):
    add(f'<circle cx="{TX + 20 + i * 15}" cy="{TY + 16}" r="4" fill="{GREY}"/>')
text(TX + 76, TY + 21, "acme.harness.eth", SUB, 11.5, 400, "start", 0.7, mono=True)

for i, (t, c, o) in enumerate([
    ("$ ssh runner@acme.harness.eth", INK, 1.0),
    ("host key from the chain · ok", SUB, 0.75),
    ("fingerprint admitted · ok", SUB, 0.75),
    ("", SUB, 0),
    ("runner@acme:~$", TEAL, 0.9),
]):
    if t:
        text(TX + 20, TY + 62 + i * 27, t, c, 12.5, 400, "start", o, mono=True)
add(f'<rect x="{TX + 138}" y="{TY + 62 + 4 * 27 - 11}" width="8" height="14" fill="{TEAL}" '
    f'fill-opacity="0.8"/>')

for i, d in enumerate(("laptop", "phone", "watch")):
    x, y = TX + 26 + i * 40, TY + TH + 32
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
text(TX + 150, TY + TH + 36, "mobile · watch · laptop", SUB, 12, 400, "start", 0.7)

# =========================================================================
# Everything that crosses. Every arrow into the chain is a question.
# =========================================================================

# The grant, in the channel between the two top zones.
GATE = (AX + AW + BX) / 2
arrow([(AX + AW + 2, AY + 128), (BX - 2, AY + 128)], AMBER)
add(f'<text x="{GATE}" y="{AY + 116}" fill="{AMBER}" fill-opacity="0.9" font-size="12" '
    f'text-anchor="middle" transform="rotate(-90 {GATE} {AY + 116})">mints the name · sets the ceiling</text>')

# The ring's whole point: the secrets land on the machine.
arrow([(AX + 88, AY + AH + 2), (AX + 88, CY - 2)], AMBER,
      "seals what the agent knows", (AX + 102, CY - 16), "start", step="3")

# The channel between the host and the chain, where the host's questions run.
# Bands run low-to-high left-to-right, so no label ever crosses another line.
CH1, CH2 = CX + CW + 22, CX + CW + 46
L1, L2, L3 = BY + BH + 22, BY + BH + 48, BY + BH + 74

arrow([(CX + CW + 2, HY + 62), (CH1, HY + 62), (CH1, L1), (NX + 60, L1), (NX + 60, BY + BH + 2)],
      VIOLET)
text(NX + 72, L1 - 8, "4  is this fingerprint admitted?", VIOLET, 12.4, 400, "start", 0.92)

arrow([(CX + CW + 2, HY + 152), (CH2, HY + 152), (CH2, L2), (BX + 170, L2), (BX + 170, BY + BH + 2)],
      VIOLET)
text(BX + 182, L2 - 8, "5  spends, against the ceiling", VIOLET, 12.4, 400, "start", 0.92)

# The nameserver is only ever a reader: it asks the resolver for an address.
arrow([(CX + 476, CY + 58), (CX + 476, L3), (BX + 70, L3), (BX + 70, BY + BH + 2)], TEAL)
text(BX + 64, L3 - 8, "6  resolve — an address, or nothing", TEAL, 12.4, 400, "end", 0.92)

# Revoke: one bool, and everything above answers differently.
arrow([(BX + BW - 16, BY + BH + 2), (BX + BW - 16, TY - 2)], "#e2615f")
text(BX + BW - 24, L2 - 8, "revoke", "#e2615f", 12.4, 400, "end", 0.95)

# The loop, round the outside.
LOOP_X, LOOP_TOP = FX + FW + 72, 58
arrow([(TX + TW + 2, TY + TH / 2), (LOOP_X, TY + TH / 2), (LOOP_X, LOOP_TOP),
       (AX + 88, LOOP_TOP), (AX + 88, AY - 4)], AMBER)
add(f'<text x="{LOOP_X + 26}" y="{(LOOP_TOP + TY + TH / 2) / 2:.0f}" fill="{AMBER}" '
    f'fill-opacity="0.9" font-size="14.5" text-anchor="middle" '
    f'transform="rotate(-90 {LOOP_X + 26} {(LOOP_TOP + TY + TH / 2) / 2:.0f})">human in the loop</text>')
text(LOOP_X - 330, LOOP_TOP - 14, "over the ceiling, the agent stops and asks a person",
     AMBER, 12.4, 400, "middle", 0.68)

add("</svg>")
open("/home/opc/hackathon/docs/diagrams/architecture-slide.svg", "w").write("\n".join(out))
print("ok")
