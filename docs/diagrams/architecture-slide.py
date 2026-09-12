"""The architecture, in the layout it was sketched in.

Same content as architecture.svg — the ring handshake, the mesh and the host,
the chain with its name tree, and the terminal — but arranged as four regions
in one frame, with the loop running round the outside from the terminal back
to the device.

Logos are the real marks, nested as whole <svg> elements so this file stands
alone with no external references.
"""

import os
import re

W, H = 1390, 830
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


def logo(name, x, y, h):
    """Nest a brand mark whole, so nothing here points at a file."""
    raw = open(os.path.join(LOGOS, f"{name}.svg")).read()
    raw = re.sub(r"<\?xml[^>]*\?>", "", raw)
    raw = re.sub(r"<title>.*?</title>", "", raw, flags=re.S)
    vb = re.search(r'viewBox="([^"]+)"', raw)
    vw, vh = (float(v) for v in vb.group(1).split()[2:]) if vb else (24.0, 24.0)
    w = h * vw / vh
    inner = raw[raw.index(">") + 1 : raw.rindex("</svg>")]
    fill = re.search(r'<svg[^>]*fill="([^"]+)"', raw)
    f = f' fill="{fill.group(1)}"' if fill else ""
    add(f'<svg x="{x - w / 2:.1f}" y="{y - h / 2:.1f}" width="{w:.1f}" height="{h}" '
        f'viewBox="{vb.group(1) if vb else "0 0 24 24"}"{f}>{inner}</svg>')
    return w


def frame(x, y, w, h, stroke, r=18, width=1.6, dash=None, opacity=0.75):
    da = f' stroke-dasharray="{dash}"' if dash else ""
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="none" stroke="{stroke}" '
        f'stroke-opacity="{opacity}" stroke-width="{width}"{da}/>')


def panel(x, y, w, h, stroke, fill, r=14, width=1.4):
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" '
        f'stroke-opacity="0.65" stroke-width="{width}"/>')


def text(x, y, s, fill, size, weight=400, anchor="middle", opacity=1.0, mono=False, spacing=None):
    fam = ' font-family="ui-monospace, SFMono-Regular, Menlo, monospace"' if mono else ""
    ls = f' letter-spacing="{spacing}"' if spacing else ""
    add(f'<text x="{x:.0f}" y="{y:.0f}" fill="{fill}" fill-opacity="{opacity}" font-size="{size}" '
        f'font-weight="{weight}" text-anchor="{anchor}"{fam}{ls}>{esc(s)}</text>')


add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
    f'font-family="Inter, ui-sans-serif, system-ui, sans-serif">')
add(f'<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
    f'orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="{AMBER}"/></marker></defs>')
add(f'<rect width="{W}" height="{H}" fill="{BG}"/>')

# =========================================================================
# The frame everything lives in.
# =========================================================================
FX, FY, FW, FH = 70, 150, 1130, 644
frame(FX, FY, FW, FH, GREY, r=26, width=1.8, opacity=1)

PAD = 30

# --- top left: how authority gets in -------------------------------------
AX, AY, AW, AH = FX + PAD, FY + PAD, 600, 250
frame(AX, AY, AW, AH, AMBER, r=18, opacity=0.55)
text(AX + AW - 24, AY + 30, "THE RING · ONCE", AMBER, 12, 600, "end", 0.75, spacing=1.6)

step_y = AY + 128
lw = logo("ledger", AX + 110, step_y, 22)
text(AX + 110, step_y + 40, "holds the seed", SUB, 12, 400, "middle", 0.7)

for cx, label, note in ((AX + 300, "browser", "carries bytes"), (AX + 490, "broker", "speaks LKRP")):
    panel(cx - 78, step_y - 28, 156, 56, AMBER, "#2a1d08")
    text(cx, step_y + 5, label, INK, 16, 500)
    text(cx, step_y + 40, note, SUB, 12, 400, "middle", 0.7)

for x1, x2 in ((AX + 160, AX + 218), (AX + 382, AX + 408)):
    add(f'<path d="M{x1} {step_y} H{x2}" stroke="{AMBER}" stroke-opacity="0.6" stroke-width="1.5" '
        f'marker-end="url(#a)"/>')

text(AX + 24, AY + AH - 22, "one press admits the broker · then it seals the agent's keys",
     AMBER, 12.5, 400, "start", 0.6)

# --- top right: the chain ------------------------------------------------
BX, BY, BW, BH = AX + AW + 30, AY, FW - AW - 2 * PAD - 30, AH
frame(BX, BY, BW, BH, SKY, r=18, opacity=0.55)
text(BX + 24, BY + 30, "ON CHAIN · ENSv2", SKY, 12, 600, "start", 0.8, spacing=1.6)

panel(BX + 24, BY + 52, 200, 62, SKY, "#0b2130")
text(BX + 124, BY + 82, "AgentResolver", INK, 14.5, 500)
text(BX + 124, BY + 101, "computed, stores none", SKY, 11, 400, "middle", 0.65)

panel(BX + 24, BY + 128, 200, 62, SKY, "#0b2130")
text(BX + 124, BY + 158, "AllowanceExecutor", INK, 14.5, 500)
text(BX + 124, BY + 177, "runs the call", SKY, 11, 400, "middle", 0.65)

EX, EY, EW, EH = BX + 244, BY + 52, BW - 268, 166
panel(EX, EY, EW, EH, SKY, "#0b2130", r=14)
logo("ens", EX + EW / 2, EY + 34, 30)
for i, (name, indent) in enumerate((("harness.eth", 0), ("acme.harness.eth", 14), ("runner", 28))):
    text(EX + 22 + indent, EY + 78 + i * 24, ("└ " if i else "") + name, SKY, 12, 400, "start", 0.85, mono=True)

# --- bottom left: the host ------------------------------------------------
CX, CY = AX, AY + AH + 34
CW, CH = 720, 300
frame(CX, CY, CW, CH, VIOLET, r=18, opacity=0.55)
text(CX + 24, CY + 30, "THE HOST · ON THE MESH", VIOLET, 12, 600, "start", 0.8, spacing=1.6)

cw, ch, gap = (CW - 48 - 22) / 2, 96, 22
cells = [
    ("sshd", "AuthorizedKeysCommand", None),
    ("its secrets", "sealed under the ring", None),
    ("the agent", "a key with no authority", ("claude", "openai")),
    ("its own network", "no public address", ("tailscale",)),
]
for i, (name, note, marks) in enumerate(cells):
    cx = CX + 24 + (i % 2) * (cw + gap)
    cy = CY + 56 + (i // 2) * (ch + gap)
    panel(cx, cy, cw, ch, VIOLET, "#191630")
    if marks:
        span = 46 * len(marks)
        for j, m in enumerate(marks):
            logo(m, cx + cw / 2 - span / 2 + 23 + j * 46, cy + 34, 24)
        text(cx + cw / 2, cy + 74, name, INK, 14.5, 500)
    else:
        text(cx + cw / 2, cy + 42, name, INK, 15.5, 500)
        text(cx + cw / 2, cy + 66, note, VIOLET, 11.5, 400, "middle", 0.7)

# --- bottom right: the way in ---------------------------------------------
TX, TY = CX + CW + 30, CY + 60
TW, TH = FW - CW - 2 * PAD - 30, 170
panel(TX, TY, TW, TH, TEAL, "#07211f", r=16)
text(TX + TW / 2, TY + 74, "Terminal", INK, 19, 600)
text(TX + TW / 2, TY + 100, "runner@acme.harness.eth", TEAL, 12.5, 400, "middle", 0.75, mono=True)

dy = TY + TH + 40
for i, d in enumerate(("laptop", "phone", "watch")):
    x = TX + TW / 2 - 96 + i * 46
    if d == "laptop":
        add(f'<g stroke="{SUB}" stroke-opacity="0.7" stroke-width="1.5" fill="none">'
            f'<rect x="{x - 15}" y="{dy - 12}" width="30" height="19" rx="2.5"/>'
            f'<path d="M{x - 20} {dy + 12} H{x + 20}" stroke-linecap="round"/></g>')
    elif d == "phone":
        add(f'<g stroke="{SUB}" stroke-opacity="0.7" stroke-width="1.5" fill="none">'
            f'<rect x="{x - 7}" y="{dy - 13}" width="14" height="25" rx="3"/></g>')
    else:
        add(f'<g stroke="{SUB}" stroke-opacity="0.7" stroke-width="1.5" fill="none">'
            f'<rect x="{x - 7}" y="{dy - 7}" width="14" height="14" rx="3"/>'
            f'<path d="M{x - 4} {dy - 7} V{dy - 13} M{x + 4} {dy - 7} V{dy - 13} '
            f'M{x - 4} {dy + 7} V{dy + 13} M{x + 4} {dy + 7} V{dy + 13}" stroke-linecap="round"/></g>')
text(TX + TW / 2 + 40, dy + 5, "mobile · watch · laptop", SUB, 12.5, 400, "start", 0.7)

# =========================================================================
# The loop: out of the terminal, round the outside, back into the device.
# =========================================================================
LOOP_X, LOOP_TOP = 1258, 58
add(f'<path d="M{TX + TW} {TY + TH / 2} H{LOOP_X} V{LOOP_TOP} H{AX + 110} V{AY + 86}" '
    f'fill="none" stroke="{AMBER}" stroke-opacity="0.75" stroke-width="1.8" '
    f'marker-end="url(#a)"/>')
add(f'<text x="{LOOP_X + 26}" y="{(LOOP_TOP + TY + TH / 2) / 2:.0f}" fill="{AMBER}" '
    f'fill-opacity="0.85" font-size="15" text-anchor="middle" '
    f'transform="rotate(-90 {LOOP_X + 26} {(LOOP_TOP + TY + TH / 2) / 2:.0f})">human in the loop</text>')
text(LOOP_X - 320, LOOP_TOP - 14, "over the ceiling, the agent stops and sends the payment back",
     AMBER, 12.5, 400, "middle", 0.6)

add('</svg>')
open("/home/opc/hackathon/docs/diagrams/architecture-slide.svg", "w").write("\n".join(out))
print("ok")
