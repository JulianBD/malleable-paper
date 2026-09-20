// paper.ts — the engine-side peer of the paper, as a project-local pi
// extension. Both directions go through the queue (web/server.ts):
// inbound, GET /events?since=N (cursor persisted in .paper-offset for
// restart survival); outbound, each settled turn's final assistant text
// is POSTed to /act as an agent_message. No direct file access — the
// extension is a queue client like any other subscriber.
//
// One session, no subagent: the log is the authority; pi is a peer.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOG = join(HERE, "..", "..", "events.jsonl");
const OFFSET = join(HERE, "..", "..", ".paper-offset");
const API = process.env.PAPER_URL ?? "http://localhost:5174";
const TEST = !!process.env.PAPER_TEST; // set for harness runs: never touch the real log

export default function (pi: ExtensionAPI) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let offset = -1;
  // every turn's last assistant text is mirrored to the log at settle —
  // the browser is the primary view; subagent-triggered turns must land too
  let lastReplyText: string | null = null;

  pi.on("message_end", async (event) => {
    if (event.message.role !== "assistant") return;
    const parts = Array.isArray(event.message.content)
      ? event.message.content.filter((p: any) => p.type === "text" && p.text?.trim())
      : [];
    if (parts.length === 0) return; // tool-call only
    // stash (not append): later text in the same turn supersedes earlier
    lastReplyText = parts.map((p: any) => p.text).join("\n\n").trim();
  });

  pi.on("agent_settled", async () => {
    if (TEST || !lastReplyText) return;
    const text = lastReplyText;
    try {
      const r = await fetch(`${API}/act`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "agent_message",
          // R1 + R2 (ruled 13:35): id and actor on every message
          id: "m_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
          actor: "agent",
          text,
        }),
      });
      if (!r.ok) throw new Error(String(r.status));
      lastReplyText = null;
    } catch {
      // server down: keep the text, retry at the next settle
    }
  });

  async function tick() {
    if (offset < 0) {
      // first poll: start from the end of the log
      try {
        const r = await fetch(`${API}/events`);
        offset = (await r.json()).length;
      } catch {
        return; // server down; try again next tick
      }
      await writeFile(OFFSET, String(offset)).catch(() => {});
      return;
    }
    let fresh: any[] = [];
    let cursor = offset;
    try {
      const r = await fetch(`${API}/events?since=${offset}`);
      ({ events: fresh, cursor } = await r.json());
    } catch {
      return;
    }
    for (const e of fresh) {
      let text: string | null = null;
      const stamp = e.ts?.slice(11, 19) ?? "";
      if (e.kind === "human_message") text = `[browser ${stamp}] ${e.text}`;
      if (e.kind === "card_response")
        text = `[card ${stamp}] ${e.card}: ${JSON.stringify(e.picks ?? {})}${e.note ? ` — ${e.note}` : ""}`;
      if (!text) continue;
      try {
        pi.sendUserMessage(text, { deliverAs: "steer" });
      } catch {
        // not streaming, no deliverAs needed — send plain
        pi.sendUserMessage(text);
      }
    }
    offset = cursor;
    await writeFile(OFFSET, String(offset)).catch(() => {});
  }

  pi.on("session_start", async (_event, ctx) => {
    if (TEST || !existsSync(LOG)) return; // not in the paper project / harness
    timer = setInterval(tick, 1500);
    await tick();
    ctx.ui.notify("paper: watching the queue at " + API, "info");
  });

  pi.on("session_shutdown", async () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  });
}
