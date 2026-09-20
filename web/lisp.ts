// web/lisp.ts — the scripting layer, now with reading.
// Programs are enqueued as {kind:"eval", program:"…"}; the drain evaluates
// them against the LIVE LOG, so acts can be conditional on state:
//
//   (if (pending-cards)
//       (frame "F-attn" :title "…" :body "…"))
//
// Reader forms fold the log inside the evaluator; writer prims expand to
// events that join the same drain and pass normal lexicon validation.
// The log stays pure events — programs are how acts arrive.

export type SExp = string | number | SExp[];

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
    if (t !== "" && !isNaN(Number(t))) return Number(t);
    return t; // symbol or :keyword
  }
  const out: SExp[] = [];
  while (i < toks.length) out.push(read());
  return out;
}

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

type Ev = Record<string, any>;

// truthiness: false, 0, "", and the empty list are false; all else true.
const truthy = (v: unknown) => v !== false && v !== 0 && v !== "" && !(Array.isArray(v) && v.length === 0);

export function evaluate(program: string, actor: string, log: Ev[]): Ev[] {
  const emitted: Ev[] = [];

  // ——— readers: folds over the log, available inside programs ———
  const pendingCards = (): string[] => {
    const cards = new Map<string, Ev>(), ruled = new Set<string>();
    for (const e of log) {
      if (e.kind === "card") cards.set(e.id, e);
      if (e.kind === "card_response" && e.final === true) ruled.add(e.card);
    }
    return [...cards.keys()].filter((id) => !ruled.has(id));
  };

  const readers: Record<string, (args: SExp[]) => unknown> = {
    // (count "kind") → number of events of that kind
    count: ([k]) => log.filter((e) => e.kind === k).length,
    // (pending-cards) → list of unrul​ed card ids
    "pending-cards": () => pendingCards(),
    // (last-field "kind" "field") → field of the latest event of kind
    "last-field": ([k, f]) => {
      const es = log.filter((e) => e.kind === k);
      return es.length ? es[es.length - 1]?.[String(f)] : "";
    },
  };

  const writers: Record<string, (id: string, rest: SExp[]) => void> = {
    frame: (id, rest) => emitted.push({ kind: "frame_def", id, ...kws(rest) }),
    card: (id, rest) => emitted.push({ kind: "card", id, ...kws(rest) }),
  };

  function evalExpr(x: SExp): unknown {
    if (!Array.isArray(x)) return x; // literals & keywords evaluate to themselves
    const [head, ...args] = x;
    if (typeof head !== "string") throw new Error("form head must be a symbol");
    if (head === "if") {
      const [test, then, els] = args;
      return truthy(evalExpr(test)) ? evalExpr(then) : els !== undefined ? evalExpr(els) : false;
    }
    if (head === "=") return evalExpr(args[0]) === evalExpr(args[1]);
    if (head === ">") return Number(evalExpr(args[0])) > Number(evalExpr(args[1]));
    if (head === "str") return args.map((a) => String(evalExpr(a))).join("");
    if (head in readers) return readers[head](args.map((a) => evalExpr(a)) as SExp[]);
    if (head in writers) {
      const id = evalExpr(args[0]);
      if (typeof id !== "string") throw new Error(head + ": first arg must be the target id");
      // keyword args may be computed: (frame (str "F-" 1) :body (str …))
      const rest: SExp[] = [];
      for (let i = 1; i < args.length; i += 2) {
        rest.push(args[i] as SExp, String(evalExpr(args[i + 1])));
      }
      writers[head](id, rest);
      return id;
    }
    throw new Error(`unknown form '${head}' — vocabulary: if = > str ${Object.keys(readers).join(" ")} ${Object.keys(writers).join(" ")}`);
  }

  for (const form of parse(program)) evalExpr(form);
  return emitted.map((e) => ({ actor, ...e }));
}
