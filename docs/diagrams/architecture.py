"""The architecture, with the two handshakes spelled out.

Three things are drawn as containment rather than as arrows: the machines are
inside the host, the host is inside the mesh, and a name is inside the name
above it. Two things are drawn as numbered steps, because they are protocols
and the order is the content: how a server earns the right to decrypt, and how
a shell gets opened.

Every coordinate comes off the column grid below. Nothing is nudged by eye, so
edges line up and the gutter stays clear.
"""

W, H = 1400, 960

# --- the grid -------------------------------------------------------------
MARGIN = 48
LEFT_X, LEFT_W = MARGIN, 792          # the ring, the mesh, the host
GUT = 110                             # where the questions to the chain run
CHAIN_X = LEFT_X + LEFT_W + GUT       # 950
CHAIN_W = W - CHAIN_X - MARGIN        # 402
PAD = 24                              # a zone's inner padding
LANE_1, LANE_2 = LEFT_X + LEFT_W + 30, LEFT_X + LEFT_W + 70

BG = "#08090a"
INK = "#eef2f8"
SUB = "#8d97a6"

AMBER = ("#e8a33d", "#2a1d08")
VIOLET = ("#9b8cf5", "#191630")
SKY = ("#5fb3e0", "#0b2130")
MESH = ("#4fd1c0", "#07211f")
RED = ("#e2615f", "#2a0f0f")

out = []
add = out.append

def esc(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def zone(x, y, w, h, label, colour, dash="7 6", note=None):
    stroke, _ = colour
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="16" fill="none" stroke="{stroke}" '
        f'stroke-opacity="0.45" stroke-width="1.4" stroke-dasharray="{dash}"/>')
    add(f'<text x="{x + PAD}" y="{y + 31}" fill="{stroke}" font-size="13" font-weight="600" '
        f'letter-spacing="1.7">{esc(label)}</text>')
    if note:
        add(f'<text x="{x + PAD}" y="{y + 51}" fill="{stroke}" fill-opacity="0.58" font-size="11.5">'
            f'{esc(note)}</text>')
    return {"x": x, "y": y, "w": w, "h": h, "r": x + w, "b": y + h, "cx": x + w / 2, "cy": y + h / 2}

def box(x, y, w, h, title, sub, colour, size=15.5):
    stroke, fill = colour
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{fill}" stroke="{stroke}" '
        f'stroke-opacity="0.7" stroke-width="1.3"/>')
    cx, mid = x + w / 2, y + h / 2
    add(f'<text x="{cx:.0f}" y="{mid - 3:.0f}" fill="{INK}" font-size="{size}" font-weight="600" '
        f'text-anchor="middle">{esc(title)}</text>')
    add(f'<text x="{cx:.0f}" y="{mid + 17:.0f}" fill="{stroke}" fill-opacity="0.78" font-size="12" '
        f'text-anchor="middle">{esc(sub)}</text>')
    return {"x": x, "y": y, "w": w, "h": h, "r": x + w, "b": y + h, "cx": cx, "cy": mid}

def chip(x, y, w, h, text, colour):
    """A box with nothing to say beyond its own name."""
    stroke, fill = colour
    add(f'<rect x="{x:.0f}" y="{y}" width="{w:.0f}" height="{h}" rx="9" fill="{fill}" '
        f'stroke="{stroke}" stroke-opacity="0.6" stroke-width="1.2"/>')
    add(f'<text x="{x + w / 2:.0f}" y="{y + h / 2 + 4:.0f}" fill="{INK}" fill-opacity="0.9" '
        f'font-size="12.5" font-weight="500" text-anchor="middle">{esc(text)}</text>')


def arrow(pts, colour, label=None, at=None, anchor="middle", vertical=False, step=None):
    stroke = colour[0]
    d = "M " + " L ".join(f"{x:.0f} {y:.0f}" for x, y in pts)
    add(f'<path d="{d}" fill="none" stroke="{stroke}" stroke-opacity="0.9" stroke-width="1.7" '
        f'stroke-linejoin="round" marker-end="url(#m{stroke[1:]})"/>')
    if label:
        lx, ly = at
        rot = f' transform="rotate(-90 {lx:.0f} {ly:.0f})"' if vertical else ""
        text = f"{step}  {label}" if step else label
        add(f'<text x="{lx:.0f}" y="{ly:.0f}" fill="{stroke}" fill-opacity="0.92" font-size="12" '
            f'text-anchor="{anchor}"{rot}>{esc(text)}</text>')

def caption(x, y, text, colour, anchor="start", opacity=0.58, size=11.8):
    add(f'<text x="{x:.0f}" y="{y}" fill="{colour[0]}" fill-opacity="{opacity}" font-size="{size}" '
        f'text-anchor="{anchor}">{esc(text)}</text>')

add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
    f'font-family="Inter, ui-sans-serif, system-ui, sans-serif">')
add('<defs>')
for c in (AMBER, VIOLET, SKY, MESH, RED):
    s = c[0]
    add(f'<marker id="m{s[1:]}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" '
        f'markerHeight="6.5" orient="auto-start-reverse">'
        f'<path d="M 0 0 L 10 5 L 0 10 z" fill="{s}"/></marker>')
add('</defs>')
add(f'<rect width="{W}" height="{H}" rx="20" fill="{BG}"/>')

# =========================================================================
# The ring: how a server earns the right to decrypt with nobody present.
# =========================================================================
ring = zone(LEFT_X, 44, LEFT_W, 202, "SETTING UP THE RING · ONCE, AND THEN NEVER AGAIN", AMBER,
            note="The key never leaves the device. The browser is a wire, not a participant.")
bw = (LEFT_W - 2 * PAD - 2 * 36) // 3
bx = [LEFT_X + PAD + i * (bw + 36) for i in range(3)]
led = box(bx[0], 118, bw, 90, "Ledger", "holds the seed, signs on a press", AMBER)
brw = box(bx[1], 118, bw, 90, "Browser", "WebHID · reads none of it", AMBER)
brk = box(bx[2], 118, bw, 90, "Broker", "speaks LKRP · stream 17", AMBER)

arrow([(led["r"], led["cy"]), (brw["x"] - 2, brw["cy"])], AMBER,
      "opens it over USB", ((led["r"] + brw["x"]) / 2, 108), step="1")
arrow([(brw["r"], brw["cy"]), (brk["x"] - 2, brk["cy"])], AMBER,
      "relays the protocol", ((brw["r"] + brk["x"]) / 2, 108), step="2")
caption(brk["cx"], 228, "3  one press admits the broker as a member", AMBER, "middle", 0.85, 12)

# =========================================================================
# The mesh: what you have to be inside before any of this is reachable.
# =========================================================================
mesh = zone(LEFT_X, 282, LEFT_W, 612, "TAILSCALE MESH", MESH,
            note="No public address, no open port. Invites are single-use.")
vw = (LEFT_W - 2 * PAD - 24) // 2
lap = box(LEFT_X + PAD, 344, vw, 84, "Your laptop", "ssh runner.alex.harness.eth", MESH)
dns = box(LEFT_X + PAD + vw + 24, 344, vw, 84, "Nameserver", "answers .eth over DNS", MESH)

host = zone(LEFT_X + PAD, 466, LEFT_W - 2 * PAD, 404, "THE HOST · ONE VM", VIOLET)
mw = (host["w"] - 2 * PAD - 20) // 2
for i, (tenant, agent) in enumerate(
        (("ALEX.HARNESS.ETH", "runner"), ("LEO.HARNESS.ETH", "indexer"))):
    mx = host["x"] + PAD + i * (mw + 20)
    zone(mx, 528, mw, 318, tenant, VIOLET, dash="4 5", note="own network, no shared filesystem")
    box(mx + 20, 592, mw - 40, 64, "sshd", "AuthorizedKeysCommand", VIOLET, size=14.5)
    box(mx + 20, 668, mw - 40, 64, agent, "a key with no authority", VIOLET, size=14.5)

    sec = zone(mx + 20, 744, mw - 40, 94, "WHAT IT KNOWS", VIOLET, dash="3 4")
    cw = (sec["w"] - 2 * 14 - 2 * 10) / 3
    for j, name in enumerate(("Claude", "Codex", "GitHub")):
        chip(sec["x"] + 14 + j * (cw + 10), 790, cw, 34, name, VIOLET)

# =========================================================================
# The chain. A name contains the names beneath it, because it really does.
# =========================================================================
chain = zone(CHAIN_X, 44, CHAIN_W, 850, "ON CHAIN · ENSv2 AND OUR REGISTRIES", SKY,
             note="Read at request time. Nothing here is a copy of anything.")
zone(CHAIN_X + PAD, 128, CHAIN_W - 2 * PAD, 264, "harness.eth · PLATFORMREGISTRY", SKY, dash="5 5")
zone(CHAIN_X + 2 * PAD, 178, CHAIN_W - 4 * PAD, 190, "alex.harness.eth · MACHINE REGISTRY",
     SKY, dash="4 5")
box(CHAIN_X + 3 * PAD, 228, CHAIN_W - 6 * PAD, 116, "runner.alex.harness.eth",
    "agentKey · window · revoked", SKY, size=14.5)

res = box(CHAIN_X + PAD, 470, CHAIN_W - 2 * PAD, 92, "AgentResolver",
          "ENSIP-10 · computed at read time", SKY)
exe = box(CHAIN_X + PAD, 620, CHAIN_W - 2 * PAD, 92, "AllowanceExecutor",
          "runs the call, holds nothing after", SKY)

arrow([(res["cx"], res["y"]), (res["cx"], 394)], SKY,
      "walks down, reads these rows", (res["cx"] - 12, 436), "end")

caption(CHAIN_X + PAD, 776, "None of these rows exist for ENS. They are what", SKY)
caption(CHAIN_X + PAD, 796, "the door and the spend path already read; the", SKY)
caption(CHAIN_X + PAD, 816, "resolver is a second reader of them.", SKY)

# --- the same tap also grants, over the top and down the right ------------
arrow([(led["cx"], led["y"]), (led["cx"], 24), (W - 24, 24), (W - 24, 116), (chain["r"] + 2, 116)],
      AMBER, "the same two taps mint the name and set the ceiling", (led["cx"] + 14, 18), "start")

# --- the ring's whole point: the secrets land on the machine --------------
MARGIN_LANE = 24   # the empty strip down the left of the page
arrow([(brk["cx"], brk["b"]), (brk["cx"], 266), (MARGIN_LANE, 266), (MARGIN_LANE, 795),
       (host["x"] - 2, 795)], AMBER,
      "4  sealed under the ring, written to the machine", (brk["cx"] - 14, 260), "end")

# --- getting a shell, step by step ---------------------------------------
arrow([(lap["r"], lap["cy"]), (dns["x"] - 2, dns["cy"])], MESH,
      "where?", ((lap["r"] + dns["x"]) / 2, 334), step="1")
arrow([(dns["r"], dns["cy"]), (LANE_2, dns["cy"]), (LANE_2, 498), (res["x"] - 2, 498)], MESH,
      "resolve — an address, or nothing", (LANE_2 - 12, 456), "end", step="2")
arrow([(lap["cx"] + 90, lap["b"]), (lap["cx"] + 90, 578)], MESH,
      "connects, offers a key", (lap["cx"] + 102, 506), "start", step="3")
arrow([(host["r"], 612), (LANE_2, 612), (LANE_2, 534), (res["x"] - 2, 534)], VIOLET,
      "is this fingerprint admitted?", (LANE_2 - 12, 700), "start", vertical=True, step="4")

# --- spending, in one line ------------------------------------------------
arrow([(host["r"], 688), (LANE_1, 688), (LANE_1, exe["cy"]), (exe["x"] - 2, exe["cy"])], VIOLET,
      "spends, against the ceiling", (LANE_1 - 12, 700), "start", vertical=True)

# --- revoke ---------------------------------------------------------------
arrow([(chain["x"], 764), (mesh["r"] + 2, 764)], RED,
      "revoke", ((chain["x"] + mesh["r"]) / 2, 754))

add(f'<text x="{LEFT_X}" y="{H - 26}" fill="{SUB}" font-size="13">'
    f'Two handshakes and one boundary. The ring is why a server can decrypt at 3am; the door is '
    f'why a shell exists only while the chain still says so; the mesh is why neither is reachable '
    f'without an invite.</text>')
add('</svg>')

open("/home/opc/hackathon/docs/diagrams/architecture.svg", "w").write("\n".join(out))
print("ok")
