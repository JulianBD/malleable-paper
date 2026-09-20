// web/bootprobe.ts — numeric verification of the boot program.
//   bun web/bootprobe.ts   (run while the server is up; a fresh restart
//                           first makes check #1 a startup-boot check)
//
// The displayed F-boot body was computed when its LATEST def was appended,
// so expected numbers = folds over the log as it stood just before that
// event — reconstructed from the log itself, no assumptions about how many
// boots ran before. Checks: F-boot in the log; page poll picks it up as
// the last frame; body numbers match independent folds; GET /boot re-run
// refreshes in place (frame count unchanged — latest-per-id — and numbers
// recomputed against a grown log).
import { chromium } from "/Users/juliandorsey/Code/malleable-paper/prototypes/interaction/node_modules/playwright/index.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const shots = join(dirname(fileURLToPath(import.meta.url)), "shots");

const base = "http://localhost:5174";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getEvents = async () => (await (await fetch(base + "/events")).json());
const fold = (es) => {
  const frames = new Map(); // id -> latest frame_def
  for (const e of es) if (e.kind === "frame_def") frames.set(e.id, e);
  const cards = new Map(), ruled = new Set();
  for (const e of es) {
    if (e.kind === "card") cards.set(e.id, e);
    if (e.kind === "card_response" && e.final === true) ruled.add(e.card);
  }
  return {
    frames,
    pending: [...cards.keys()].filter((id) => !ruled.has(id)),
    count: (k) => es.filter((e) => e.kind === k).length,
  };
};

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
};

// ——— 1. boot landed: latest F-boot def, and what its program folded ———
const es0 = await getEvents();
const f0 = fold(es0);
const isBootDef = es0.map((e) => e.kind === "frame_def" && e.id === "F-boot");
check("log: F-boot defined (defs so far)", es0.filter((_, i) => isBootDef[i]).length >= 1, true);
check("log: latest boot eval audited its products",
  es0.filter((e) => e.kind === "eval" && e.actor === "boot").at(-1).emitted, ["frame_def"]);
check("log: boot def is the last event (fresh boot)", es0.at(-1).kind === "frame_def" && es0.at(-1).id === "F-boot", true);
const idx = isBootDef.lastIndexOf(true); // log state the displayed body folded
const pre = fold(es0.slice(0, idx));
const total0 = 4 + f0.frames.size; // 4 static frames + dyn folds

// ——— 2. page poll picks it up ———
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(base, { waitUntil: "networkidle" });
await sleep(3000); // poll
check("page: frame 1 of total", await page.locator("#frame-title").textContent(),
  `1/${total0} · geometry · the corner contract`);
for (let i = 0; i < total0 - 1; i++) await page.keyboard.press("ArrowRight");
await sleep(400);
check("page: last frame is boot's", await page.locator("#frame-title").textContent(),
  `${total0}/${total0} · boot · the runtime starts here`);

const body0 = await page.locator(".dynframe").textContent();
const wantPending = pre.pending.length
  ? `${pre.pending.length} open — ${pre.pending.join(", ")}`
  : "none — the docket is clear";
check("body: human messages (fold)", body0.includes(`human messages: ${pre.count("human_message")}`), true);
check("body: agent messages (fold)", body0.includes(`agent messages: ${pre.count("agent_message")}`), true);
check("body: evals (fold at boot time — its own eval event appends after it runs)",
  body0.includes(`evals: ${pre.count("eval") - 1}`), true);
check("body: frame switches (fold)", body0.includes(`frame switches: ${pre.count("frame_switch")}`), true);
check("body: frame defs (fold)", body0.includes(`frame defs: ${pre.count("frame_def")}`), true);
check("body: pending cards (fold)", body0.includes(`pending cards: ${wantPending}`), true);
await page.screenshot({ path: join(shots, "14-boot-frame.png") });

// ——— 3. GET /boot re-runs: refresh, not duplicate ———
// grow the log with an event the page ignores (frame_switch is page-local
// state) so the refreshed body must show a NEW number
const posted = await (await fetch(base + "/act", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ kind: "frame_switch", frame: 1 }),
})).json();
check("act: frame_switch enqueued", posted.ok, true);
await sleep(600); // drain
const reb = await (await fetch(base + "/boot")).json();
check("GET /boot: ok", reb.ok, true);
await sleep(3500); // drain + page poll

const es1 = await getEvents();
const f1 = fold(es1);
check("re-boot: one more boot eval + F-boot def", [
  es1.filter((e) => e.kind === "eval" && e.actor === "boot").length,
  es1.filter((e) => e.kind === "frame_def" && e.id === "F-boot").length,
], [es0.filter((e) => e.kind === "eval" && e.actor === "boot").length + 1,
    es0.filter((_, i) => isBootDef[i]).length + 1]);
check("re-boot: frame count UNCHANGED (fold keeps one F-boot)", 4 + f1.frames.size, total0);
check("re-boot: latest F-boot def counts the new event",
  f1.frames.get("F-boot").body.includes(`frame switches: **${f1.count("frame_switch")}**`), true);
check("page: title UNCHANGED (refresh, not duplicate)",
  await page.locator("#frame-title").textContent(), `${total0}/${total0} · boot · the runtime starts here`);
check("page: live-updated body shows the new number",
  (await page.locator(".dynframe").textContent()).includes(`frame switches: ${f1.count("frame_switch")}`), true);
await page.screenshot({ path: join(shots, "15-boot-refreshed.png") });
await browser.close();

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
