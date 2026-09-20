# schema/ — the lexicon registry (draft, candidate)

One JSON file per object kind, atproto-lexicon-style. Each lexicon describes
ONE node of the paper as three machines that share an id and nothing else:

```
            ┌─────────────────────────────────────────┐
 events ──▶ │ DOMAIN   data → infer → intend → act    │ ──▶ events
            │  fold the log, derive state, queue      │
            │  intents, emit acts                     │
            ├─────────────────────────────────────────┤
 ticks ───▶ │ SYSTEM   lifecycle & transport          │ ──▶ polls, posts
            │  poll offset, connection, focus, frame  │
            │  membership; owns WHEN domain runs      │
            ├─────────────────────────────────────────┤
 state ───▶ │ RENDER   projection to DOM              │ ──▶ pixels
            │  pure fn of (domain, system) + local    │
            │  ephemeral (drag-in-progress, scroll)   │
            └─────────────────────────────────────────┘
```

Domain never touches the DOM. Render never invents domain facts
(ruling 3). System never interprets — it moves bytes and ticks.

## The four-phase domain cycle, mapped

| phase | meaning | in the lexicon |
|---|---|---|
| data | fold consumed events into state | `domain.fold` (named reducer) |
| infer | derive status from state | `domain.derives` (named derivations) |
| intend | local intents queue between ticks | `domain.intents` |
| act | intent commits → append event | `domain.acts` (event + guard) |

Simple machines declare their transition table as data
(`domain.states.*.on`). Complex ones name a reducer in code
(`fold: "resolver:cornerContract"`) — the lexicon is the registry,
not the runtime.

## Honesty gaps in the current log (need rulings, not silence)

1. **Messages have no `id`.** pending→answered pairing needs one.
   Candidate: `id: "m_" + ts_ms + rand4` on every message event.
2. **Chat events have no `actor`** — kind carries it. Geometry events
   started `actor`. Pick one convention; candidate: `actor` everywhere,
   kind stays the verb.
3. **Boxes are addressed by `name: "A"|"B"`, not `id`.** Fine at n=2,
   but the shared-addressing argument from bootstrap says ids.
4. **`box_drag` was specced (~80ms samples, record ●) but the log holds
   none.** Either the recorder never emitted or the kind died. Lexicon
   lists it as `status: proposed`.
5. **Frame/drawer/record are DOM-only** — no events, no lexicons yet.
   Ruling 7 says frame_switch wants to be an event. Drawer + record
   look ephemeral (candidate: local render state, never events).

## Files

- `paper.chat.message.json` — the chat box (filled, exemplar)
- `paper.box.json` — geometry boxes A/B (filled, exemplar)
- `paper.frame.json` — the frame switcher (filled, exemplar)
- stubs to come: drawer, record, doc-box pager, reader
