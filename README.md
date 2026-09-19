# Malleable paper — a paper that can write back

A UX prototype of one interaction. You write a messy paragraph on something that
feels like paper. After a two-second pause your **exact words** lift out of the
paragraph and settle into a more operable structure. Generated headings and
proposals appear only after your material has moved. You tend the paper's
implications (yes, no, later), you steer its intentions from one quiet command
line, you drag a phrase out of the flow to pin it on the plane, and an
append-only event log underneath explains every change.

It is a prototype of the interaction model, not of an architecture.

## Run it

```bash
bun install
bun run dev        # http://localhost:5173
bun test           # reader, doer, tending and policy tests
bun run typecheck
```

Click **load demo** and wait. Then: hover a block and press **⋯** or a letter
(`a q r i n f` set the type, `Esc` leaves it as written); press **/** and type a
command; hold **Space** to see the paragraph under the structure; drag a phrase
to the right of the column to pin it; drag another near it; use the margin
arrows or the arrow keys to move to an adjacent frame; open **log** at the
bottom. **reset** clears the log.

## The editor: Wordgard, not "Midgard"

The brief asked for "Midgard". No such package exists on npm, jsr, or the Obsidian
GitHub organization. The project meant is Marijn Haverbeke's ProseMirror successor,
published as **`wordgard`** (`0.5.2`, MIT). The API used, read from the package's
own `.d.ts` files:

| import | used for |
|---|---|
| `Wordgard.create({ parent, doc, config })` from `wordgard/editor` | mounting the editor |
| `Wordgard.updateListener.of(update => …)` | append-only capture of every document transaction |
| `doc.iterate(...)`, `Leaf.param`, `Plot.isTextblock` from `wordgard/doc` | plain text + an offset→position table |
| `wg.domAtPos(pos)` + a DOM `Range` | where an authored span sits on screen (source rects for the animation) |
| `blockDoc()`, `paragraph()`, `lineBreak()`, `history()`, `placeholder()` | the smallest schema with paragraphs, undo and a placeholder |

Wordgard owns text entry, positions, transactions, selection and undo. Nothing
semantic lives in its document. The integration is `src/editor/WordgardEditor.tsx`
behind a three-method `EditorAdapter` (`getText`, `measureRange`, `focus`).

## The model: two loops, one list

The human and the agent each run two processes in parallel. A **reader** infers
from data. A **doer** acts on an intention. They interlock through two shared
stores: the **event log** (data) and the **implication list** (inference).

```
             human doer ──── types · drags · tends · steers ────┐
                                                                ▼
   ┌────────────────────────────────────────────────────────────────────┐
   │  EVENT LOG   append-only, per frame, mirrored to localStorage      │  authoritative
   │  human_event · user_correction · policy_change · system_inference  │
   └────────────────────────────────────────────────────────────────────┘
                                │ reduce()            pure fold
                                ▼
                FrameState { text, tends, corrections, pinned, statuses }
                Policies   { …, heldBack: agent intentions switched off }
                                │
        agent reader ───────────┤ interpret()  = interpreter + scanner producers
                                ▼
   ┌────────────────────────────────────────────────────────────────────┐
   │  IMPLICATION LIST   key = subject|claim · confidence · basis ·     │  derived,
   │  state ∈ proposed · confirmed · rejected · deferred · superseded   │  running
   │  claims: type · group · parent · near · intent                     │
   └────────────────────────────────────────────────────────────────────┘
                 │ present()  (reader half)        │ propose()  (doer half)
                 ▼                                 ▼
        Presentation                        Proposals
        sections, blocks, nesting,          toggle · soundboard · connect · nest,
        pinned blocks, treatment            each the UI form of one implication
                 └──────────── Frame.tsx ──────────┘
                          human reader
```

Files: `src/events/` (types, store, reducer), `src/interpretation/`
(segment, classify, interpret, scanner, implications), `src/projection/`
(present, propose, Frame, Blocks, transition), `src/automation/policies.ts`,
`src/chat/CommandLine.tsx`, `src/dev/EventInspector.tsx`, `src/App.tsx`.

### What each stage needs to see

| stage | who | needs access to | gets it from |
|---|---|---|---|
| infer from data | agent reader | the text, the human's tends, segmentation edits, pinned geometry, the policies that change what counts as an action | `FrameState` + `Policies` |
| infer from data | human reader | the presentation, and on demand: why (hover a marker), the source (hold Space), the list itself (⋯ menu, log drawer) | `Frame.tsx`, `Replica`, `EventInspector` |
| choose an intention | agent doer | the implication list with states, and its own tended intention set | `interp.implications`, `policies.journal.heldBack` |
| choose an intention | human | the agent's intent claims about them, shown as questions, and the agent's intentions, shown as policy | `clarify` line, `.policies` line |
| act | agent | nothing beyond the list: an action is a proposal, which is a rendering of one implication | `propose()` |
| act | human | the targets: blank space, span, object, label, group, relation, margin arrow, proposal, selection | `Blocks.tsx`, `Frame.tsx` |
| record | both | an append-only log with the frame id on every event | `appendEvent` |

### Authoritative vs derived

| | what | where |
|---|---|---|
| **authoritative** | every text change (with its snapshot), every tend, every segmentation edit, every pin, every policy change, every frame visit | `events/store.ts` |
| **derived on every event** | `FrameState`, `Interpretation` (objects + implication list), `Presentation`, `Proposals` | `reduce` → `interpret` → `present` · `propose` |
| **instrumentation, never authoritative** | `implications_ran` (`eventType: system_inference`) so the drawer shows the chain | `App.structure()` |
| **ephemeral** | stage, animation phase, raw-hold, focused block, last reply | React state |

A tend is durable. `implication_rejected` on `obj-7|type=action` means that claim is
never proposed again for that subject; `implication_deferred` on `obj-7|intent=resolve`
removes its next move until a producer revises it. Old logs replay: the five
original correction kinds map onto tends of type, near and parent claims.

### The three classes of UI content

* **Authored** — every phrase in a block, every next-move label, the headings *felt
  better after* and *keep thinking*: exact substrings of the source, in roman
  serif. The tests assert it for every object and label.
* **Derived presentation** — grouping, order, nesting, bullets, colour, italics,
  indentation, pinned placement.
* **Generated language** — small caps in the same serif, muted: section labels
  such as *Sleep*, the affordance verbs, the clarification *an action?*, command
  replies. No summaries, no advice, no paraphrase.

## Demo flows

1. **Brain dump → visible restructuring.** Spans highlight, lift, and fly into
   *Sleep / Work / felt better after / Open*; connectives fade; markers and colour
   settle; *Today* and generated headings fade in; then proposals.
2. **Tending.** *want to do something different with my weekends* is inferred a
   soft action (0.62) and gets *an action? yes / no*. **no** rejects
   `…|type=action`: the block leaves *Open* and settles under the authored heading
   *keep thinking* as a reflection; its next move disappears.
3. **Steering.** `/` then *Don't turn casual thoughts into tasks.* → policy patch,
   `automation_policy_changed`, *Open* becomes *Intentions*, no next moves.
   *Stop suggesting next moves.* holds back one agent intention and changes only
   the doer, never the reader (tested).
4. **Pinning.** Drag a phrase right of the column: it is pinned on the plane
   (`block_pinned`); dragging it back into the column returns it to flow. Drag a
   second near it: the scanner emits `a|near=b`, the doer offers *connect these?*;
   confirming it is the connection (a dashed line, a *connected* chip). Drop one
   indented under another: *group under?*; confirming re-nests it in the flow.
5. **Frames.** Arrows or arrow keys move to the adjacent frame on the plane. Each
   frame has its own text, tends and pins; the log carries the frame id.
6. **Raw.** Hold Space: the paragraph shows through the structure.

## How animated provenance is implemented

`src/projection/transition.ts` and the `Replica` in `Frame.tsx`.

1. While the editor is visible, every object's `displayRange` (and every authored
   label range) is measured through `wg.domAtPos` + `Range.getClientRects()`.
2. The structured layout mounts in the **lift** phase in the same commit as the
   stage change. A `Replica` of the paragraph lies over the same column: the spans
   about to move are invisible slots keeping their space; the connectives are
   visible glue. The editor is hidden underneath, still mounted.
3. `useFlip` (FLIP keyed by `data-flip` = object id) measures each destination
   span, applies the inverse transform so it renders on its source rect (left
   edges and vertical centres aligned), and releases after 260 ms. Duration and
   easing come from confidence (`motionFor`).
4. Phases drive CSS: lift → move → settle → label → affordance → idle. Typography
   does not change until a span has settled.
5. Every later relayout (a tend, a policy change, a pin, a return to flow) is the
   same hook diffing previous rects; a drop seeds the hook with the drop rect so
   the block does not jump. Returning to the editor is the inverse (`flyTo`).

No animation library.

## Shortcuts taken

* **Text snapshots in events.** Each `text_changed` carries the full text after the
  change. Honest replay from deltas would need Wordgard positions in the reducer.
* **Ids are content hashes** of the displayed phrase. A tend is lost if the phrase
  it points at is rewritten. Split pieces are `id` and `id.2`; a merge keeps the
  first id.
* **Producers are regexes**: connectives, stub stripping, marker-based typing,
  five keyword topics, hand-written intents per marker, geometry with estimated
  box heights. Tuned to make the case study excellent.
* **Editing and structure are separate stages.** *write* returns to the paragraph;
  the structured view is not editable in place.
* **Commands are pattern-matched**; only the seven seeds (plus a few phrasings) work.
* **Frames are a naked grid.** A frame is `"x,y"`; visiting creates it. What an
  adjacent frame *means* (a day, a topic) is not decided.
* **No marquee select and no group target.** Of the nine targets, selection and
  group are not built.
* **Persistence is localStorage**, capped at 3000 events.

## What should be replaced by CRDT / agent infrastructure later

* `events/store.ts` and snapshot events → a CRDT (`wordgard/collab` exists) or an
  event-sourced doc with stable span anchors, so ids stop being content hashes.
* `interpretation/interpret.ts` and `scanner.ts` → model producers that keep the
  **same contract**: stable id, exact substring + range, claims with a key, a
  confidence and a basis, never replacement text. The list, the reader and the
  doer need nothing else.
* `automation/policies.ts` → an agent that maps utterances to tends of its own
  intentions; the `heldBack` set and the patch event are already the interface.
* The proposal shapes (`toggle`, `soundboard`, `connect`, `nest`) → a registry of
  widgets with declared semantics, so a widget's events can become claims.

## What this prototype proves or fails to prove

**Proves, on one paragraph:**

* The loop *data → implications → intention → proposal → data* runs on an
  append-only log with three pure functions, and a reader/doer split falls out of
  it cleanly: holding back an agent intention changes proposals and nothing else.
* One running list with keys and states is enough for durable tending: every
  correction the first version had is now a tend of a claim, and legacy events
  replay onto it.
* Typographic structure and spatial placement coexist in one frame without a
  mode switch. Dragging out of the column is the whole gesture.
* Animated provenance survives the extra machinery.

**Fails to prove:**

* That the implications are any good. Regex producers give one hand-written
  implication per rule; intent in particular is a guess per marker.
* That the list stays legible as it grows. There is no per-frame budget and no
  threshold beyond the toggle's 0.65; a real producer would flood the margin.
* That editing and structure can coexist in place.
* That generated language in small-caps serif reads as generated. The sans/serif
  split was a stronger signal; this is a bet on restraint.
* That content-hash ids survive real editing.
* That a naked frame grid is the right space. Arrows work; what they lead to is
  undecided.
