// web/lisp.ts — the scripting layer, seed version.
// Agent acts are programs: (frame "F-id" :title "…" :body "…") enqueued as
// {kind:"eval", program:"…"}; the queue's drain evaluates them into plain
// events, which then pass through normal lexicon validation. The log stays
// pure events — the lisp is how acts ARRIVE, not what gets stored.
//
// Primitives are the DSL of the substrate; each returns event descriptor(s)
// that the drain validates and appends. Adding a primitive = adding an
// affordance to the act stage. This is the emacs layer: one evaluator,
// everything scriptable, no privileged UI.

export type SExp = string | SExp[];

export function parse(src: string): SExp[] {
  const toks = src.match(/"(?:[^"\\]|\\.)*"|[()]|[^\s()]+/g) ?? [];
  let i = 0;
  function read(): SExp {
    const t = toks[i++];
    if (t === "(") {
      const list: SExp[] = [];
      while (toks[i] !== ")") {
        if (i >= toks.length) throw new Error("unclosed (");
        list.push(read());
      }
      i++;
      return list;
    }
    if (t === ")") throw new Error("unexpected )");
    if (t.startsWith('"')) return JSON.parse(t);
    return t; // symbol or keyword
  }
  const out: SExp[] = [];
  while (i < toks.length) out.push(read());
  return out;
}

// keyword args: (:title "x" :body "y") → {title: "x", body: "y"}
function kws(args: SExp[]): Record<string, string> {
  const o: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i];
    if (typeof k !== "string" || !k.startsWith(":")) throw new Error("expected :keyword, got " + JSON.stringify(k));
    const v = args[i + 1];
    if (typeof v !== "string") throw new Error("expected string value for " + k);
    o[k.slice(1)] = v;
  }
  return o;
}

// the primitive vocabulary — the act stage's affordance set.
// each returns event descriptors; the drain validates them against the
// registry like any other act. homoiconic honesty: programs are data,
// effects are events, and the mapping between them lives here, in the open.
const PRIMS: Record<string, (id: string, rest: SExp[]) => Record<string, unknown>[]> = {
  // (frame "F-id" :title "…" :body "markdown…")  → frame_def
  frame: (id, rest) => [{ kind: "frame_def", id, ...kws(rest) }],
  // (card "R-id" :title "…" :blurb "…")  → card (tables/forms stay JSON for now)
  card: (id, rest) => [{ kind: "card", id, ...kws(rest) }],
};

export function evaluate(program: string, actor: string): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  for (const form of parse(program)) {
    if (!Array.isArray(form) || typeof form[0] !== "string") throw new Error("top-level form must be (prim …)");
    const prim = PRIMS[form[0]];
    if (!prim) throw new Error(`unknown primitive '${form[0]}' — vocabulary: ${Object.keys(PRIMS).join(", ")}`);
    const id = form[1];
    if (typeof id !== "string") throw new Error("first arg must be the target id");
    events.push(...prim(id, form.slice(2)).map((e) => ({ actor, ...e })));
  }
  return events;
}
