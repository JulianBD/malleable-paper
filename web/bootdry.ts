// web/bootdry.ts — dry-run harness for boot.scm: evaluate it against the
// live log WITHOUT going through the queue — evaluate() only returns the
// products, nothing is validated or appended. Iterate on boot.scm here;
// then GET /boot (or a restart) runs it for real.
//   bun web/bootdry.ts
import { evaluate } from "./lisp";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const program = await readFile(join(root, "boot.scm"), "utf8");
const log = (await Bun.file(join(root, "..", "events.jsonl")).text())
  .split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

const products = await evaluate(program, "boot-dry", log);
console.log("emitted kinds:", products.map((p) => p.kind).join(", "));
for (const p of products) console.log(JSON.stringify(p, null, 1));
