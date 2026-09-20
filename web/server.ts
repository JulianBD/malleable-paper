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

const server = Bun.serve({
  port: 5174,
  async fetch(req) {
    const url = new URL(req.url);
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
        text: body.text,
      };
      await appendFile(LOG, JSON.stringify(event) + "\n");
      return Response.json({ ok: true });
    }
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      return new Response(Bun.file(join(root, "index.html")));
    }
    return new Response("not found", { status: 404 });
  },
});

console.log(`malleable-paper listening on http://localhost:${server.port}`);
console.log(`event log: ${LOG}`);
