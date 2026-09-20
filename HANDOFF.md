# HANDOFF — the workspace is a program

**State: 2026-09-20 ~18:15 EDT. Repo: github.com/JulianBD/malleable-paper (main, pushed; repo is currently PUBLIC — Julian's call to flip private).**

## The thesis (read this first)

> The thing that allows effective externalized thinking — alone or with an
> agent — **just is a programming language**. Not a chat interface, not a
> webapp: the working surface is a program buffer. A lisp specifically,
> because it is homoiconic (no seam between what the human edits and what
> the machine reads — *editable by both* is the load-bearing constraint),
> minimally syntactic (the surface never fights the thought), maximally
> expressive for natural-language-shaped ideas (nouns→symbols,
> verbs→applications), and maximally extendable (vocabulary grows by
> definition: `act`, `fold`, `verdict`, `fact` are just forms).

Consequence: the simplest viable version of this project works with **any
agent, any harness** — a repo containing a runnable program, a record
(`events.jsonl`), and this note. No bespoke runtime is load-bearing.

## The inversion (what changed today)

For most of this project's life, the design space AND the target were a
vanilla-TS webapp (`web/index.html`, a 1000-line monolith). That solved too
many concerns at once and made the mental model un-shareable (Julian wrote
no JS; the agent's model lived in prose rulings, not in checkable code).

The inversion: **a Lisp is the medium.** Ologs are *theories* (type layer,
git-time); programs construct and check them; verdicts are the design
conversation. The webapp is demoted to an **effects host** (validated
intake, append, serve) and at most a display library callable from a
program. Everything the widget proved out — types, letters, folds,
supersede-not-delete, verdicts — is now **specification, vocabulary for the
language**, not implementation to port.

Historical echoes already in the record: the 9/20 0355 handoff ruled "the
vault becomes a projection, not the author"; `boot.scm` was a program whose
output is a projection. Tonight's ruling events: `T-olog-as-runnable-theory`,
`T-thesis` (in `events.jsonl` — query `kind:"thread"`).

## Where things live

| path | role |
|---|---|
| `racket/olog.rkt` | the olog library: types/aspects/facts, path readings, congruence closure, olog + functor (alignment) checks, dot output |
| `racket/paper.rkt` | the project's own ontology as a runnable theory — open in DrRacket, hit Run |
| `events.jsonl` | the record. Design rulings are `kind:"thread"` events |
| `schema/` | lexicons (type layer; git-time; validated against at intake) |
| `web/` | server (:5174, `bun web/server.ts`), the widget, nine playwright probes |

Racket 9.3 is installed (`brew install --cask racket`, on PATH).

## What exists in web/ (works, but demoted)

Nine probes green (`bun web/<name>.ts`: probe, hydraprobe, sketchprobe,
verbprobe, makeprobe, supersedeprobe, pathprobe, inspectorprobe, panprobe).
The widget units 1–9: olog sketch frame, inline verb/name asks,
supersede-not-delete, dangling/bare/ambiguity checks with evidence panels,
path-to-sentence strip, node inspector, incremental folds, pan/zoom.
That corpus is now **specification** — read the commit messages as design
record. Don't extend the webapp unless asked.

## How to work here (conventions, harness-independent)

1. The workspace is a `.rkt` buffer. Thinking = editing and evaluating it.
   Adjudication object is **program text**: propose small edits Julian can
   read and run; he rules.
2. Candidates, never rulings — offer, mark uncertainty, never silently
   sandbag; silence defaults to stop.
3. Design verdicts belong in the record: if the server is running, POST
   `kind:"thread"` events; if not, commit messages and this repo suffice —
   git is the fallback record.
4. Commit per unit with honest messages; run the thing before claiming it
   works; probes/screenshots for his eyes, numeric checks for yours.
5. The log is **multi-writer**: Julian may be dragging nodes in a live tab
   while you work. Never assume exclusivity.

## Open threads

- **A** first tangible design artifact — arguable: `racket/` is it; confirm.
- **B** where a node's trait-ness lives (type/instance) — stale, reframed by lisp.
- **C** is a frame itself a node? — identity-principles question, now part of
  the paper olog's open facts.
- **D** sheets vs one canvas — pending; the alignment/functor discussion
  suggested sheets + declared alignments, but the lisp inversion may absorb
  this entirely (documents are programs).
- **E** facts before composition / is the olog the medium — resolved by the
  thesis: the language is the medium; ologs are theories in it.
- Subagent dispatch was unreliable (4/5 empty-output failures in the pi
  harness); verify side effects before trusting a subagent's report.
- `paper.rkt`'s `kind` type is an orphan — no true fact about kinds could
  be stated yet. That gap is a design question, not a bug.

## Next moves (Julian adjudicates)

1. Adjudicate the paper olog in DrRacket: the types, the two facts, the
   alignment mapping. Edit the theory, run, watch verdicts.
2. Explore the inversion: the minimal harness-independent convention —
   a repo + a program + a record + conventions, no platform.
3. When the olog library's stable core emerges, port it into the runtime's
   hosted scheme (`web/lisp.ts`) so verdicts become acts (actor "linter").
