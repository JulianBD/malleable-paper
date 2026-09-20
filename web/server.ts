// malleable-paper v0: serves the input page and appends messages to the
// authoritative event log. The log is the tool; this server is a projection
// of nothing yet — just the thinnest pipe from browser to disk.
//
//   bun run web/server.ts   → http://localhost:5174

import { appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const LOG = join(root, "..", "events.jsonl");

async function readEvents() {
  try {
    const raw = await Bun.file(LOG).text();
    return raw.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  } catch {
    return []; // no log yet
  }
}

const server = Bun.serve({
  port: 5174,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/events") {
      return Response.json(await readEvents());
    }
    if (req.method === "POST" && url.pathname === "/event") {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return new Response("invalid json", { status: 400 });
      }
      if (typeof body.kind !== "string" || !body.kind) {
        return new Response("kind required", { status: 400 });
      }
      const event = { ts: new Date().toISOString(), ...body };
      await appendFile(LOG, JSON.stringify(event) + "\n");
      return Response.json({ ok: true });
    }
    if (req.method === "POST" && url.pathname === "/message") {
      let body: { text?: unknown };
      try {
        body = await req.json();
      } catch {
        return new Response("invalid json", { status: 400 });
      }
      if (typeof body.text !== "string" || body.text.trim() === "") {
        return new Response("text required", { status: 400 });
      }
      const event = {
        ts: new Date().toISOString(),
        kind: "human_message",
        // R1 (ruled 13:35): message ids; R2: actor everywhere
        id: "m_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        actor: "human",
        text: body.text,
      };
      await appendFile(LOG, JSON.stringify(event) + "\n");
      return Response.json({ ok: true });
    }
    if (req.method === "GET" && url.pathname === "/events") {
      return Response.json(await readEvents());
    }
    // static assets from web/ (index.html, house.css, …)
    if (req.method === "GET") {
      const safe = url.pathname.replace(/^\/+/, "");
      if (safe && !safe.includes("..")) {
        const file = Bun.file(join(root, safe));
        if (await file.exists()) return new Response(file);
      }
      if (url.pathname === "/") {
        return new Response(Bun.file(join(root, "index.html")));
      }
    }
    return new Response("not found", { status: 404 });
  },
});

console.log(`malleable-paper listening on http://localhost:${server.port}`);
console.log(`event log: ${LOG}`);
