// paper.ts — the inbound half of the browser channel, as a project-local
// pi extension. Watches events.jsonl from the malleable-paper umbrella;
// each new human_message arrives in this session as a user message
// (steer if streaming, immediate if idle). The reply path stays manual:
// the agent appends agent_message to the log (bash), the browser polls it.
//
// One session, no subagent: the log is the authority; pi is a peer.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOG = join(HERE, "..", "..", "events.jsonl");
const OFFSET = join(HERE, "..", "..", ".paper-offset");
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
    lastReplyText = null;
    await appendFile(
      LOG,
      JSON.stringify({
        ts: new Date().toISOString(),
        kind: "agent_message",
        // R1 + R2 (ruled 13:35): id and actor on every message
        id: "m_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        actor: "agent",
        text,
      }) + "\n",
    ).catch(() => {});
  });

  async function readLines(): Promise<any[]> {
    try {
      const raw = await readFile(LOG, "utf8");
      return raw.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
    } catch {
      return [];
    }
  }

  async function tick() {
    if (offset < 0) {
      // first poll: start from the end of the log
      offset = (await readLines()).length;
      await writeFile(OFFSET, String(offset)).catch(() => {});
      return;
    }
    const events = await readLines();
    for (let i = offset; i < events.length; i++) {
      const e = events[i];
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
    offset = events.length;
    await writeFile(OFFSET, String(offset)).catch(() => {});
  }

  pi.on("session_start", async (_event, ctx) => {
    if (TEST || !existsSync(LOG)) return; // not in the paper project / harness
    timer = setInterval(tick, 1500);
    await tick();
    ctx.ui.notify("paper: watching events.jsonl", "info");
  });

  pi.on("session_shutdown", async () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  });
}
