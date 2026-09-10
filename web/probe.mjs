import { chromium } from "playwright-core";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium-browser",
  headless: false,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const msgs = [];
page.on("console", (m) => msgs.push(`[${m.type()}] ${m.text().slice(0, 240)}`));
page.on("pageerror", (e) => msgs.push(`[pageerror] ${String(e).slice(0, 400)}`));
await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(6000);
console.log("  canvas count:", await page.locator("canvas").count());
console.log("  terminal present:", await page.locator("text=agent research").count());
console.log("  console:");
for (const m of msgs.slice(0, 12)) console.log("   ", m);
await browser.close();
