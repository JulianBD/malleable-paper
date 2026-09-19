# Malleable paper — a paper that can write back

A UX prototype of one interaction: you write a messy paragraph on something that
feels like paper; after a two-second pause your **exact words** visibly lift out
of the paragraph and settle into a more operable structure; generated headings and
actions appear only after your material has moved; you can correct one bad
interpretation and steer the automation from a narrow chat panel; an append-only
event log underneath explains every change.

It is a prototype of the interaction model, not of an architecture.

## Run it

```bash
bun install
bun run dev        # http://localhost:5173
bun test           # interpreter + projection + policy tests
bun run typecheck
```

Click **Load demo**, wait two seconds, watch. Then: hover a block and press **⋯**
to correct it; click a seed command in the *Steering* panel; open the **Event log**
drawer at the bottom; try **Spatial**. **Reset** clears the log.

## The editor: Wordgard, not "Midgard"

The brief asked for "Midgard" from the Obsidian GitHub organization. No such package
exists on npm, jsr, or (as far as the sandbox's network policy allowed) GitHub. The
project meant is Marijn Haverbeke's ProseMirror successor, which is published as
**`wordgard`** (this prototype uses `wordgard@0.5.2`, MIT). The API used, all read
from the package's own `.d.ts` files, is:

| import | used for |
|---|---|
| `Wordgard.create({ parent, doc, config })` from `wordgard/editor` | mounting the editor |
| `Wordgard.updateListener.of(update => …)` | append-only capture of every document transaction (`update.docChanged`, `update.changes.iterChanges`) |
| `wg.state.doc.iterate(...)`, `Leaf.param`, `Plot.isTextblock` from `wordgard/doc` | building plain text + an offset→position table |
| `wg.domAtPos(pos)` + a DOM `Range` | measuring where an authored span sits on screen (source rects for the animation) |
| `blockDoc()`, `paragraph()`, `lineBreak()` from `wordgard/schema`; `history()`; `placeholder()` | the smallest schema that gives paragraphs, undo, and a placeholder |

Wordgard owns text entry, positions, transactions, selection and undo. Nothing
semantic is stored in its document: the interpreter reads plain text and returns
ranges. The whole integration is one file, `src/editor/WordgardEditor.tsx`, behind a
three-method `EditorAdapter` interface (`getText`, `measureRange`, `focus`).

## Architecture

```
            human types / clicks / drags / chats
                          │
                          ▼
   ┌──────────────────────────────────────────────┐
   │  EVENT LOG   (append-only, in memory,        │   authoritative
   │  mirrored to localStorage)                   │
   │  human_event · user_correction ·             │
   │  policy_change · system_inference            │
   └──────────────────────────────────────────────┘
                          │ reduce()  (pure fold)
                          ▼
              SourceState { text, corrections,
                            policies, statuses, spatial }
                          │ interpret()  (pure, deterministic; the LLM/agent seam)
                          ▼
              Interpretation { objects[{ id, sourceText, sourceRange,
                               displayRange, inferredType, confidence,
                               groupId, parentId, … }], groups, glue }
                          │ project()  (pure)
                          ▼
              Projection { sections, blocks, treatments,
                           affordances, nextMoves }
                          │
            ┌─────────────┴──────────────┐
   DocumentProjection.tsx        SpatialProjection.tsx
   (FLIP animation, correction   (drag, proximity → offer)
    menu, affordances)
```

Files: `src/events/` (types, store, reducer), `src/interpretation/` (segment,
classify, interpret), `src/projection/` (project, transition, Document/Spatial),
`src/automation/policies.ts` (policy state + chat command parser),
`src/chat/Collaborator.tsx`, `src/dev/EventInspector.tsx`, `src/App.tsx`.

### Authoritative vs derived

| | what | where |
|---|---|---|
| **Authoritative** | the event log: every text change (with the snapshot text), every correction, every policy change, clicks, spatial moves | `events/store.ts` |
| **Derived, recomputed on every event** | `SourceState`, `Interpretation`, `Projection` | `reduce` → `interpret` → `project` |
| **Recorded but never authoritative** | `interpretation_ran` events (`eventType: system_inference`) — written for the inspector so the causal chain is visible; the reducer ignores them | `App.structure()` |
| **Ephemeral** | chat transcript, animation phase, view toggle | React state |

A correction is an event (`user_rejected_type`, `user_confirmed_type`,
`user_unstructured`, `user_merged`, `user_split`). The reducer turns it into a
constraint keyed by object id; the interpreter honours the constraint on every
recompute, so the same inference is not made again and it survives reload.

### The three classes of UI content

* **Authored** — every phrase in a block, every next-move button label, and the
  headings *felt better after* and *keep thinking* are exact substrings of the
  source, rendered in the serif. The tests assert this for every object and label.
* **Derived presentation** — grouping, order, nesting, bullets, colour, italic
  headings, indentation. Owned by `project()` and CSS.
* **Generated language** — always sans-serif, small, muted: section labels such as
  *Sleep*, *Work*, *Open*, the six affordance verbs, the clarification question
  *Is this an action?*, chat replies. No summaries, no advice, no paraphrase.

A displayed phrase may be a sub-range of its clause (`displayRange ⊂ sourceRange`):
"I should probably text Sam back" is shown as "text Sam back". The dropped words
are "glue"; they fade in place during the animation and are all still there under
**Raw**.

## Demo flows

1. **Brain dump → visible restructuring.** Load demo. After ~1 s (2 s when typing)
   the paragraph's spans highlight, lift, and fly into *Sleep / Work / felt better
   after / Open*; connectives fade; markers and colour settle; then *Today* and the
   generated headings fade in; then the affordances and *Possible next moves*.
2. **Correction.** *want to do something different with my weekends* is inferred as
   a soft action (confidence 0.62, shown tentative with *Is this an action? yes/no*).
   Press **no** (or ⋯ → *Not an action*): the block leaves *Open* and settles under
   the authored heading *keep thinking* as a reflection; its next-move button
   disappears; `user_rejected_type` is in the log.
3. **Steering.** Type or click *Don't turn casual thoughts into tasks.* The reply
   shows the policy patch; an `automation_policy_changed` event is appended; *Open*
   becomes *Intentions* with ◇ markers and no next moves. Also seeded: *Be more
   subtle…*, *Only surface things that sound explicitly unresolved*, *Treat this
   paragraph as background*, *Show me things I said I wanted to do, but don't make
   them commitments*, *Reset to defaults*. Current policy is shown under the chat.
4. **Spatial.** Drag *stayed up too late scrolling* next to *slept kind of badly
   again*: the pair glows and **Connect these?** appears. Accepting appends
   `blocks_connected` (spatial-only metadata; the document shows a small
   *connected* chip and nothing else). Dropping a block indented just under another
   offers **Group under?**, which appends `block_grouped`.
5. **Round trip.** `block_grouped` re-nests the child under its parent in the
   document projection (same object ids). Connections do not round-trip into text
   because adjacency has no faithful textual meaning; they stay spatial-only.
   **← write** flies every span back onto its paragraph position and reveals the
   editor; edits re-run the loop and prior corrections still apply.

## How animated provenance is implemented

`src/projection/transition.ts`, plus the `Replica` in `DocumentProjection.tsx`.

1. While the editor is still visible, `App.structure()` asks the adapter for the
   on-screen rect of every object's `displayRange` (and every authored label range)
   via `wg.domAtPos` + `Range.getClientRects()`.
2. The structured layout mounts in the **lift** phase (same React commit as the
   stage change). A `Replica` of the paragraph is laid over the same column: the
   spans that are about to move are invisible slots that keep their space; the
   connectives are visible "glue". The editor is hidden underneath but kept
   mounted. Because editor, replica and projection share one column, one font and
   zero chrome, the swap is pixel-stable.
3. `useFlip` (a small FLIP hook keyed by `data-flip` = object id) measures each
   destination span, applies the inverse transform so it renders exactly on its
   source rect (left edges and vertical centres aligned), and after 260 ms releases
   it. Duration and easing come from confidence (`motionFor`): ≥0.8 moves in
   520 ms decisively; <0.65 takes 820 ms with a softer curve and arrives marked
   *tentative* with a clarification affordance.
4. Phases drive CSS only: **lift** (highlight) → **move** (glue fades, spans fly)
   → **settle** (markers, indentation, colour, italics, child size) → **label**
   (title and generated headings) → **affordance** (buttons, questions, next
   moves) → idle. Typography does not change until the piece has settled.
5. Every later relayout (correction, policy change, spatial grouping) is the same
   hook diffing the previous rects, so a block visibly travels from its old
   section to its new one. Returning to the editor is the inverse: `flyTo` moves
   spans onto rects measured from the (hidden) editor, glue fades back in, then
   the editor is revealed.

No animation library. The animated element is the destination element, which is
the standard FLIP compromise: the DOM node is re-parented by React, but the text is
identical and it starts on the source's pixels, so the eye tracks one object.

## Shortcuts taken

* **Text snapshots in events.** Each `text_changed` event carries Wordgard's
  change ranges *and* the full text afterwards; the reducer uses the snapshot. Honest
  replay from deltas would need Wordgard position semantics in the reducer.
* **Ids are content hashes.** An object's id is a hash of its normalised displayed
  text (plus an occurrence index). Stable across corrections, policy changes and
  spatial moves; a correction is lost if you rewrite the phrase it points at.
  Split pieces are `id` and `id.2`; a merge keeps the first id.
* **The interpreter is regexes.** Sentence and clause splitting on a fixed list of
  connectives, leading-stub stripping, marker-based typing, five keyword topics.
  Tuned to make the case study excellent; it will be wrong on other prose.
* **Editing and structure are separate stages.** You cannot type into the
  structured view; **← write** takes you back. Simultaneous rich editing with a
  live animated projection is not solved here.
* **Chat commands are pattern-matched**, and only the six seeded intents (plus a few
  phrasings) work.
* **Spatial mode is a few hundred lines**: absolute-positioned nodes, drag,
  proximity test, two offers. No pan/zoom, no edges editor, not JSON Canvas.
* **Persistence is localStorage**, capped at 3000 events.

## What should be replaced by CRDT / agent infrastructure later

* `events/store.ts` and the snapshot-in-event shortcut → a CRDT (Wordgard ships a
  `wordgard/collab` module) or an event-sourced doc with stable span anchors, so
  `sourceRange` survives concurrent edits and ids stop being content hashes.
* `interpretation/interpret.ts` → an LLM/agent that returns the **same contract**:
  stable id, exact source substring + range, type, confidence, optional group,
  optional actions, optional short label. Never replacement text. The projection
  and animation need nothing else from it.
* `automation/policies.ts` → an agent that maps utterances to policy patches; the
  patch shape and the `automation_policy_changed` event are already the interface.
* `system_inference` events → a real inference journal, if provenance of *why* an
  interpretation was made is wanted long-term.

## What this prototype proves or fails to prove

**Proves (or at least demonstrates convincingly on one paragraph):**

* The loop *raw text → inferred structure → animated reorganisation → affordances →
  correction/steering → re-interpretation* can be built on an append-only log with
  three pure functions, and the log really is the only state that matters: reload
  replays everything, corrections and policies persist, the inspector shows the
  chain.
* Animated provenance is achievable without an animation library, and it does the
  explanatory work: because every block starts on its own pixels, the question
  "where did this come from?" never arises. Aligning on vertical centres and keeping
  the paragraph's typography until settle were the two details that made it read as
  one object rather than a copy.
* Corrections as *manipulating the interpretation* feel right: "not a task" moves
  the block, changes its marker, removes its button, and opens a heading made from
  the author's own words.
* Chat as a control plane is cheap to make real when policy is explicit state that
  the interpreter reads.

**Fails to prove:**

* That the interpretation is any good. It is deterministic regexes tuned to one
  paragraph; a second messy paragraph exposes it quickly (topic keywords are naive,
  "I think" is treated as a hedge, questions never split). Whether an LLM can hold
  the *exact-substring, no-paraphrase* contract reliably is untested.
* That the animation scales. Ten spans is legible; forty flying spans across a
  long entry would be noise. Grouping the motion (section by section) is untried.
* That editing and structure can coexist. The stage switch is a real limitation:
  the moment you want to tweak a word inside the structured view you are back in
  the paragraph. A projection that stays editable in place is the hard problem and
  is not attempted.
* That users understand which words are theirs. Serif-vs-sans is the whole
  signal; the *Possible next moves* buttons carry authored text inside generated
  chrome and could be read as system speech.
* That ids can be stable without a CRDT. Content-hash ids work until the author
  edits the phrase, then the correction silently drops.
* That "confidence" is meaningful. Here it is a hand-picked number per regex;
  slower motion for lower confidence is a nice idea whose value cannot be judged
  from fake numbers.
