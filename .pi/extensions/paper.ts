// paper.ts — the inbound half of the browser channel, as a project-local
// pi extension. Watches events.jsonl from the malleable-paper umbrella;
// each new human_message arrives in this session as a user message
// (steer if streaming, immediate if idle). The reply path stays manual:
// the agent appends agent_message to the log (bash), the browser polls it.
//
// One session, no subagent: the log is the authority; pi is a peer.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOG = join(HERE, "..", "..", "events.jsonl");
const OFFSET = join(HERE, "..", "..", ".paper-offset");

export default function (pi: ExtensionAPI) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let offset = -1;

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
      if (e.kind !== "human_message") continue;
      const stamp = e.ts?.slice(11, 19) ?? "";
      const text = `[browser ${stamp}] ${e.text}`;
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
    if (!existsSync(LOG)) return; // not in the paper project
    timer = setInterval(tick, 1500);
    await tick();
    ctx.ui.notify("paper: watching events.jsonl", "info");
  });

  pi.on("session_shutdown", async () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  });
}
