import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

/**
 * Look at the page.
 *
 * Screenshots are how design work gets reviewed instead of guessed at. This box
 * has no display, so: chromium headful under Xvfb, software GL through
 * SwiftShader, and the capture taken through CDP directly — Playwright's own
 * `screenshot()` fails here with "Unable to capture screenshot", while the
 * protocol command underneath it works.
 */

const at = Number(process.argv[2] ?? 2000);
const out = process.argv[3] ?? "/tmp/shot.png";
const url = process.argv[4] ?? "http://127.0.0.1:3000/";

const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium-browser",
  headless: false,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-dev-shm-usage",
    "--window-size=1440,900",
  ],
});

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 180)));
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 180)));

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(at);

console.log(
  "  " +
    (await page.evaluate(() => {
      const c = document.querySelector("canvas");
      if (!c) return "no canvas";
      const gl = c.getContext("webgl2") || c.getContext("webgl");
      return gl
        ? `canvas ${c.width}x${c.height} · ${gl.getParameter(gl.VERSION)} · ${gl.getParameter(gl.RENDERER)}`
        : "canvas, no GL context";
    })),
);

const cdp = await page.context().newCDPSession(page);
const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
writeFileSync(out, Buffer.from(data, "base64"));

if (errors.length) console.log("  errors:\n" + errors.slice(0, 5).map((e) => "    " + e).join("\n"));
await browser.close();
