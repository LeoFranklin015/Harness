# Looking at the work

This box has no display, and two attempts at a 3D hero were built and rejected
without me ever seeing either of them. That is not iteration, it is guessing.

```
xvfb-run -a --server-args="-screen 0 1440x900x24" \
  chromium-browser --headless=new --no-sandbox --enable-unsafe-swiftshader \
    --window-size=1440,900 --hide-scrollbars --virtual-time-budget=3000 \
    --screenshot=/tmp/shot.png http://127.0.0.1:3000/preview
```

`/preview` renders pieces on their own so they can be reviewed in isolation.

Three things had to be true before a screenshot was possible at all:

- **Chromium from `dnf`, not Playwright.** Playwright's installer wants
  `apt-get` and gives up on Oracle Linux.
- **`--enable-unsafe-swiftshader` alone.** Adding `--use-angle=swiftshader`
  drops it to WebGL 1, and three then fails on a missing
  `OES_packed_depth_stencil`.
- **Chromium's own `--screenshot`, not CDP.** `Page.captureScreenshot` returns
  "Unable to capture screenshot" here, headless or under Xvfb.

## Why the hero is CSS and not WebGL

It cannot lose a graphics context halfway through a demo on a judge's laptop,
it costs no dependency — and, decisively, it can be screenshotted and reviewed
rather than guessed at. The first WebGL hero rendered nothing at all and nobody
knew for two rounds.

## The bug underneath both rejected attempts

The dev server's HMR websocket was blocked as a cross-origin request from
`141.148.209.77`, which killed hydration: **no client JavaScript ran**. No
scene, no terminal, no timeline — just static text on a black page. Demo from
`next build && next start`, not `next dev`, or add `allowedDevOrigins` to
`next.config.ts`.
