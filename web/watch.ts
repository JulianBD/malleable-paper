// The agent half of the loop. Watches events.jsonl for new human_message
// events, feeds each to a persistent pi session (so the paper remembers),
// and appends its reply as an agent_message. You watch the log in the
// browser; this watches it from the other side.
//
//   bun web/watch.ts
//
// Stops when killed. Keeps its read offset in web/.watch-offset so a
// restart doesn't re-answer old messages.

import { appendFile, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const LOG = join(root, "..", "events.jsonl");
const OFFSET = join(root, ".watch-offset");
const SESSION = "malleable-paper";

async function readOffset(): Promise<number> {
  if (!existsSync(OFFSET)) {
    // first run: start from the end, don't replay history
    const lines = await readLines();
    const n = lines.length;
    await writeFile(OFFSET, String(n));
    return n;
  }
  return Number(await readFile(OFFSET, "utf8"));
}

async function readLines(): Promise<any[]> {
  try {
    const raw = await readFile(LOG, "utf8");
    return raw.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

const PI = "/Users/juliandorsey/.local/share/mise/installs/npm-earendil-works-pi-coding-agent/latest/node_modules/.bin/pi";

async function reply(text: string): Promise<string | null> {
  const proc = Bun.spawn([PI, "-p", "--session-id", SESSION, text], {
    cwd: join(root, ".."),
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  const code = await proc.exited;
  if (code !== 0) {
    console.error("pi exited", code, err);
    return null;
  }
  return out.trim() || null;
}

let offset = await readOffset();
console.log(`watching ${LOG} from event ${offset}`);

while (true) {
  const events = await readLines();
  for (let i = offset; i < events.length; i++) {
    const e = events[i];
    if (e.kind !== "human_message") continue;
    console.log(`answering: ${e.text.slice(0, 60)}`);
    const text = await reply(e.text);
    if (text) {
      await appendFile(
        LOG,
        JSON.stringify({ ts: new Date().toISOString(), kind: "agent_message", text }) + "\n",
      );
      console.log("replied");
    }
  }
  offset = events.length;
  await writeFile(OFFSET, String(offset));
  await Bun.sleep(1000);
}
