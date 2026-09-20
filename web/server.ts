// malleable-paper v0: serves the paper and owns the event log.
//
// The engine machine, smallest honest version (built by use, 13:4x):
// ALL intake goes through one act queue. Producers register acts
// (POST /act, /event, /message — the latter two are compat shims that
// enqueue). A drain tick validates each act against the lexicon
// registry (schema/*.json: known kind, required fields present),
// stamps commit-time ts, and appends the batch to events.jsonl.
// Readers use GET /events?since=N — {events, cursor} — instead of
// re-reading the whole log.
//
//   bun run web/server.ts   → http://localhost:5174

import { appendFile, readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { evaluate } from "./lisp";

const root = dirname(fileURLToPath(import.meta.url));
const LOG = join(root, "..", "events.jsonl");
const SCHEMA = join(root, "..", "schema");
const DRAIN_MS = 250;

// ——— lexicon registry: kind → required fields (the intake contract) ———
let lexicons = []; // full lexicon JSONs, served at /registry
async function loadRegistry() {
  const registry = new Map();
  try {
    for (const f of await readdir(SCHEMA)) {
      if (!f.endsWith(".json")) continue;
      try {
        const lex = JSON.parse(await readFile(join(SCHEMA, f), "utf8"));
        lexicons.push(lex);
        for (const [kind, spec] of Object.entries(lex?.events?.emits ?? {})) {
          if (kind && typeof spec === "object" && !Array.isArray(spec))
            registry.set(kind, spec.required ?? []);
        }
      } catch (e) {
        console.warn(`schema ${f} failed to parse: ${e.message}`);
      }
    }
  } catch {}
  return registry;
}
let registry = await loadRegistry();
console.log(`lexicon registry: ${[...registry.keys()].sort().join(", ")}`);

// the registry is live: lexicons evolve as we design, so schema/ changes
// reload it (debounced) — otherwise every new kind needs a server restart,
// which is exactly the friction the queue exists to remove.
import { watch } from "node:fs";
let reloadTimer;
watch(SCHEMA, () => {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(async () => {
    lexicons = [];
    registry = await loadRegistry();
    console.log(`registry reloaded: ${[...registry.keys()].sort().join(", ")}`);
  }, 200);
});

async function readEvents() {
  try {
    const raw = await Bun.file(LOG).text();
    return raw.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

// ——— the queue ———
let queue = []; // acts registered between drains
const rejects = []; // validation failures, surfaced via /queue for debugging

function enqueue(act) {
  queue.push(act);
  return queue.length; // position hint, not a cursor
}

// ——— boot: web/boot.scm through the queue ———
// The boot program is not special-cased: runBoot() reads it fresh from
// disk and enqueues it as an eval act, so its products take the same
// validate-and-append path as any drain batch (failures land in /queue,
// logged, server lives). frame_def folds latest-per-id → re-boots
// refresh the F-boot frame, never duplicate it. Reading the file per
// call means editing boot.scm + GET /boot takes effect without a restart.
const BOOT = join(root, "boot.scm");
async function runBoot() {
  try {
    const program = await readFile(BOOT, "utf8");
    const position = enqueue({ kind: "eval", program, actor: "boot" });
    console.log(`boot queued (position ${position}) — web/boot.scm`);
    return { ok: true, position };
  } catch (e) {
    console.warn(`boot failed: ${e.message}`);
    return { ok: false, why: e.message };
  }
}

async function drain() {
  if (!queue.length) return;
  const batch = queue;
  queue = [];
  // eval acts expand first: a program's products join this same drain,
  // validated like anything else. The eval event itself is logged (with
  // what it emitted) — the audit trail is: program, then products.
  const expanded = [];
  for (const act of batch) {
    if (act.kind === "eval") {
      try {
        const products = await evaluate(String(act.program ?? ""), String(act.actor ?? "agent"), await readEvents());
        expanded.push({ ...act, emitted: products.map((p) => p.kind) }, ...products);
      } catch (e) {
        console.warn(`eval failed (${act.actor ?? "?"}): ${e.message} — also in /queue`);
        rejects.push({ act, why: `eval failed: ${e.message}`, ts: new Date().toISOString() });
      }
    } else {
      expanded.push(act);
    }
  }
  const lines = [];
  for (const act of expanded) {
    const required = registry.get(act.kind);
    if (!required) {
      rejects.push({ act, why: `unknown kind '${act.kind}' — no lexicon emits it`, ts: new Date().toISOString() });
      continue;
    }
    const missing = required.filter((f) => act[f] === undefined && f !== "ts");
    if (missing.length) {
      rejects.push({ act, why: `missing required: ${missing.join(", ")}`, ts: new Date().toISOString() });
      continue;
    }
    lines.push(JSON.stringify({ ts: new Date().toISOString(), ...act }));
  }
  if (lines.length) await appendFile(LOG, lines.join("\n") + "\n");
  if (rejects.length > 20) rejects.splice(0, rejects.length - 20);
}
setInterval(drain, DRAIN_MS);

const server = Bun.serve({
  port: 5174,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/events") {
      const events = await readEvents();
      const since = url.searchParams.get("since");
      if (since !== null) {
        const n = Math.max(0, parseInt(since) || 0);
        return Response.json({ events: events.slice(n), cursor: events.length });
      }
      return Response.json(events); // legacy full-array shape
    }

    if (req.method === "GET" && url.pathname === "/queue") {
      return Response.json({ pending: queue.length, rejects, kinds: [...registry.keys()].sort() });
    }

    if (req.method === "GET" && url.pathname === "/registry") {
      return Response.json(lexicons);
    }

    // re-run the boot program on demand (boot.scm is re-read)
    if (req.method === "GET" && url.pathname === "/boot") {
      return Response.json(await runBoot());
    }

    // canonical intake
    if (req.method === "POST" && url.pathname === "/act") {
      let body;
      try { body = await req.json(); } catch { return new Response("invalid json", { status: 400 }); }
      if (typeof body.kind !== "string" || !body.kind) return new Response("kind required", { status: 400 });
      return Response.json({ ok: true, position: enqueue(body) });
    }

    // compat shims — both enqueue; /message supplies the human_message envelope
    if (req.method === "POST" && url.pathname === "/event") {
      let body;
      try { body = await req.json(); } catch { return new Response("invalid json", { status: 400 }); }
      if (typeof body.kind !== "string" || !body.kind) return new Response("kind required", { status: 400 });
      return Response.json({ ok: true, position: enqueue(body) });
    }
    if (req.method === "POST" && url.pathname === "/message") {
      let body;
      try { body = await req.json(); } catch { return new Response("invalid json", { status: 400 }); }
      if (typeof body.text !== "string" || body.text.trim() === "") return new Response("text required", { status: 400 });
      // R1 (ruled 13:35): message ids; R2: actor everywhere
      return Response.json({
        ok: true,
        position: enqueue({
          kind: "human_message",
          id: "m_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
          actor: "human",
          text: body.text,
        }),
      });
    }

    // static assets from web/ (index.html, house.css, …)
    if (req.method === "GET") {
      const safe = url.pathname.replace(/^\/+/, "");
      if (safe && !safe.includes("..")) {
        const file = Bun.file(join(root, safe));
        if (await file.exists()) return new Response(file);
      }
      if (url.pathname === "/") return new Response(Bun.file(join(root, "index.html")));
    }
    return new Response("not found", { status: 404 });
  },
});

console.log(`malleable-paper listening on http://localhost:${server.port}`);
console.log(`event log: ${LOG} · drain every ${DRAIN_MS}ms`);

await runBoot(); // the runtime starts here — boot.scm → queue → drain
