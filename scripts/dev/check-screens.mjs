// Dev only: visit every screen and check the Glance floors.
//
//   node scripts/dev/check-screens.mjs [routes.txt] [--shots <dir>]
//
// For every route (lines of `name=/route`, optionally `|clickSelector` to
// open something first) at 2560×1440 and 1920×1080 it reports:
//   - page scroll: the page itself is wider or taller than the screen;
//   - small text: visible text under 18px at 1080-equivalent (1.125rem);
//   - small targets: a visible button, link, field or tab under 48px
//     (3rem) in either direction.
// Sizes are judged in rem against the page's own root font size, which
// scales with the screen (globals.css), so "18px at 1080" means the same
// thing at every size.
//
// It uses playwright-core from /workspace/audit-tools (no project
// dependency) and the system Chrome. It signs in with the dev seed login
// (scripts/dev/seed-sample.mjs); set SEED_EMAIL / SEED_PASSWORD to change
// it, BASE for another server, SIZES="2560x1440,1920x1080" for other sizes.
// Exit code 1 if anything failed.

import fs from "node:fs";
import path from "node:path";

const PLAYWRIGHT = process.env.PLAYWRIGHT_CORE || "/workspace/audit-tools/node_modules/playwright-core/index.mjs";
const { chromium } = await import(PLAYWRIGHT);

const args = process.argv.slice(2);
const shotsAt = args.indexOf("--shots");
const shots = shotsAt >= 0 ? args.splice(shotsAt, 2)[1] : null;
const routesFile = args[0] || "/workspace/glance-tools/routes.txt";
const BASE = process.env.BASE || "http://localhost:3100";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome";
const sizes = (process.env.SIZES || "2560x1440,1920x1080").split(",").map((s) => s.split("x").map(Number));

/** Floors at 1080-equivalent, in rem (1rem = 16px at 1920×1080). */
const MIN_TEXT_REM = 18 / 16;
const MIN_TARGET_REM = 48 / 16;
/** Half a pixel of rounding is not a failure. */
const SLACK_PX = 0.5;

const routes = fs
  .readFileSync(routesFile, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"))
  .map((l) => {
    const i = l.indexOf("=");
    const [route, ...clicks] = l.slice(i + 1).split("|");
    return { name: l.slice(0, i), route, clicks };
  });

if (shots) fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });

async function signIn(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill("input[name=email]", process.env.SEED_EMAIL || "glance@example.test");
  await page.fill("input[name=password]", process.env.SEED_PASSWORD || "glance-local-only");
  await Promise.all([page.waitForURL((u) => !String(u).includes("/login"), { timeout: 30000 }), page.click('button:has-text("Sign in")')]);
  await page.close();
}

/** Runs in the page: everything that breaks a floor. */
function measure({ minText, minTarget, slack }) {
  const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const vw = innerWidth;
  const vh = innerHeight;
  const out = { scroll: null, text: [], targets: [] };
  const doc = document.documentElement;
  if (doc.scrollWidth > vw + 1 || doc.scrollHeight > vh + 1) out.scroll = `${doc.scrollWidth}x${doc.scrollHeight}`;

  const skip = (el) => el.closest("nextjs-portal, [data-nextjs-toast], [aria-hidden=true], [inert], .sr-only");
  const visible = (el) => {
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) return null;
    return r;
  };
  const describe = (el) => {
    const text = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.tagName).replace(/\s+/g, " ").trim();
    return text.slice(0, 50);
  };

  // Text: elements with their own visible words.
  const seenText = new Set();
  for (const el of document.body.querySelectorAll("*")) {
    if (skip(el)) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && /\S/.test(n.textContent));
    if (!own) continue;
    if (!visible(el)) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px + slack < minText * root) {
      const key = `${describe(el)}|${px}`;
      if (seenText.has(key)) continue;
      seenText.add(key);
      out.text.push({ what: describe(el), rem: +(px / root).toFixed(3) });
    }
  }

  // Targets: things you tap. A tick box or radio counts by the label around it.
  const seenTargets = new Set();
  const tappable = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch], [role=radio], [role=checkbox], summary';
  for (let el of document.body.querySelectorAll(tappable)) {
    if (el.matches("input[type=checkbox], input[type=radio]") || el.closest(".sr-only")) {
      const label = el.closest("label");
      if (!label) continue;
      el = label;
    }
    if (skip(el)) continue;
    const r = visible(el);
    if (!r) continue;
    const min = minTarget * root - slack;
    if (r.width < min || r.height < min) {
      const key = `${describe(el)}|${Math.round(r.width)}x${Math.round(r.height)}`;
      if (seenTargets.has(key)) continue;
      seenTargets.add(key);
      out.targets.push({ what: describe(el), rem: `${(r.width / root).toFixed(2)}x${(r.height / root).toFixed(2)}` });
    }
  }
  return out;
}

let failures = 0;
for (const [w, h] of sizes) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, timezoneId: process.env.TZ_ID || "America/Toronto" });
  await signIn(context);
  const page = await context.newPage();
  for (const { name, route, clicks } of routes) {
    await page.goto(BASE + route, { waitUntil: "networkidle" }).catch(() => {});
    for (const c of clicks) {
      await page.click(c, { timeout: 8000 }).catch((e) => console.error(`  click failed on ${name}: ${c}: ${e.message.split("\n")[0]}`));
      await page.waitForTimeout(500);
    }
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    if (shots) await page.screenshot({ path: path.join(shots, `${name}-${w}.png`) });
    const r = await page.evaluate(measure, { minText: MIN_TEXT_REM, minTarget: MIN_TARGET_REM, slack: SLACK_PX });
    const bad = (r.scroll ? 1 : 0) + r.text.length + r.targets.length;
    failures += bad;
    console.log(`${bad ? "FAIL" : "ok  "} ${w}x${h} ${name} ${route}${clicks.length ? ` | ${clicks.join(" | ")}` : ""}`);
    if (r.scroll) console.log(`       page scrolls: ${r.scroll}`);
    for (const t of r.text) console.log(`       small text ${t.rem}rem: ${t.what}`);
    for (const t of r.targets) console.log(`       small target ${t.rem}rem: ${t.what}`);
  }
  await context.close();
}
await browser.close();
console.log(failures ? `\n${failures} problem(s)` : "\nAll screens pass.");
process.exit(failures ? 1 : 0);
