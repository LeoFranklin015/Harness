import { chromium } from "playwright-core";
const flags = JSON.parse(process.argv[2]);
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium-browser", headless: false, args: ["--no-sandbox", "--disable-dev-shm-usage", ...flags] });
const page = await browser.newPage();
await page.goto("about:blank");
const r = await page.evaluate(() => {
  const c = document.createElement("canvas");
  const gl = c.getContext("webgl2") || c.getContext("webgl");
  if (!gl) return "NO CONTEXT";
  return `${gl.getParameter(gl.VERSION)} | packed_depth_stencil=${!!gl.getExtension("WEBGL_depth_texture") || !!gl.getExtension("OES_packed_depth_stencil")}`;
});
console.log("  " + r);
await browser.close();
