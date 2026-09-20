// web/lisp.ts — the FFI floor between the paper's Scheme (LIPS) and JS.
//
// Everything mechanical lives here and ONLY here: parsing/eval (LIPS),
// event emission, log folds, string concat. The language above the floor —
// stdlib.scm and every program queued as {kind:"eval"} — is portable
// Scheme. Swap the host (browser DOM → filesystem → anything) by
// re-binding this file's functions; the programs don't change.
//
// Writers take positional args: (frame "F-id" "title" "markdown body").
// Readers return LIPS values (lists as Pairs) so Scheme predicates work.

import lips from "@jcubic/lips";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const STDLIB = join(dirname(fileURLToPath(import.meta.url)), "stdlib.scm");
let stdlibCache: string | null = null;
async function stdlib(): Promise<string> {
  if (stdlibCache === null) stdlibCache = await readFile(STDLIB, "utf8");
  return stdlibCache;
}
export function invalidateStdlib() { stdlibCache = null; }

type Ev = Record<string, any>;
const S = (x: unknown): string => String(x); // LIPS strings are LString objects

export async function evaluate(program: string, actor: string, log: Ev[]): Promise<Ev[]> {
  const emitted: Ev[] = [];
  const push = (kind: string, fields: Ev) => emitted.push({ kind, actor, ...fields });

  // ——— readers: folds over the log ———
  const pendingCards = (): string[] => {
    const ruled = new Set<string>(), cards = new Set<string>();
    for (const e of log) {
      if (e.kind === "card") cards.add(e.id);
      if (e.kind === "card_response" && e.final === true) ruled.add(e.card);
    }
    return [...cards].filter((id) => !ruled.has(id));
  };

  // ——— the FFI floor: every host binding, in one place ———
  const floor = {
    // writers (emit events into the same drain batch)
    frame: (id: unknown, title: unknown, body: unknown) => { push("frame_def", { id: S(id), title: S(title), body: S(body) }); },
    card: (id: unknown, title: unknown, blurb: unknown) => { push("card", { id: S(id), title: S(title), blurb: S(blurb) }); },
    // readers
    count: (kind: unknown) => log.filter((e) => e.kind === S(kind)).length,
    "pending-cards": () => lips.Pair.fromArray(pendingCards()),
    "last-field": (kind: unknown, field: unknown) => {
      const es = log.filter((e) => e.kind === S(kind));
      const v = es.length ? es[es.length - 1]?.[S(field)] : undefined;
      return v === undefined ? "" : (typeof v === "object" ? JSON.stringify(v) : v);
    },
    // string primitive our prelude builds on (JS concat; host-level)
    concat: (...xs: unknown[]) => xs.map(S).join(""),
  };

  const env = new lips.Environment(floor as any, lips.global_environment);
  try {
    await lips.exec((await stdlib()) + "\n" + program, env);
  } catch (e: any) {
    throw new Error(`eval failed: ${e.message}`);
  }
  return emitted;
}
