# Malleable Paper — a paper that writes back

*Product pitch · prototype 4 · 19 September 2026. The HTML version with the
same content is `docs/pitch.html`; every screenshot is captured from the
running prototype by `docs/walk.ts`.*

You write in your own words. The paper reorganises them, proposes what to do,
and shows its work. Every inference is yours to accept, reject, or defer.

## The problem

A journal, a to-do list, a plan and a spreadsheet are four apps because each
fixes its structure up front. Writing into any of them is filling a form. AI
assistants remove the form and replace it with a chat: you get back a
paraphrase, in someone else's voice, with the reasoning hidden.

Malleable Paper keeps the form out and the voice in. The surface is blank
paper. The structure arrives after you write, made only of your own phrases,
and you can see where each piece came from.

## What it looks like

![writing](screens/02-writing.png)
*Writing. One column, no chrome.*

![lift](screens/03-lift.png)
*Lift. The exact spans that will move are highlighted where they sit; the
connectives fade.*

![move](screens/04-move.png)
*Move. The same phrases fly into clusters. No headings, markers or buttons
yet. This frame is the thesis.*

![structured](screens/06-structured.png)
*Structured. Generated headings arrive last, small and uppercase. "Felt better
after" is the author's own phrase used as a heading. A soft claim is shown
tentative with a question. Two next moves are offered.*

## Tending

![tend menu](screens/08-tend-menu.png)
*The ⋯ menu lists what the paper believes about the block, with state,
confidence and reason.*

![after no](screens/09-after-no.png)
*After "no", the block settles under "Keep thinking" as a reflection. The
rejection is permanent for that claim.*

## Steering

![command](screens/10-command.png)
![steered](screens/11-steered.png)
*One command line tends the paper's intentions. "Don't turn casual thoughts
into tasks." turns Open into Intentions and removes the next moves.*

## The plane

![nest offer](screens/13-nest-offer.png)
*Drag a phrase out of the column to pin it. Nearness offers "connect these?";
an indented drop offers "group under?". Nearness is evidence, never a
conclusion.*

![raw](screens/15-raw-hold.png)
![frame right](screens/18-frame-right.png)
*Hold Space to see the paragraph through the structure. Arrow keys move to the
adjacent frame, which has its own text, tends and pins.*

Markers are geometry: disc note, square action, ring question, diamond
reflection, filled diamond intention, triangle reference. Green once confirmed.

## The contract

| class | rule |
|---|---|
| authored | exact substrings of what you wrote; regular weight, ink; never paraphrased |
| derived | grouping, order, nesting, markers, colour, placement; the paper changes these freely |
| generated | new words; small, uppercase, coloured; only a label, a verb, or a question |

Animate provenance: structure starts on the pixels of the words it came from.
The agent's intentions are visible and tendable: policy is the tended set of
what the paper is trying to do.

## The model: two loops, two stores

```
data → inference → intention → action → data
```

A reader infers from data: input the event log, output the implication list.
A doer acts on an intention: input the intention set, output an action, which
lands in the log. The human and the paper each run both, in parallel. Each
arrow is a question: what does this mean, what is wanted, what can be done,
what happened.

**The implication list.** Data in, plausible implications out, as a running
list. Every claim has a key (`subject|claim`), a confidence, a basis and a
state: proposed, confirmed, rejected, deferred, superseded. A human tend on a
key outlives every re-emission. Every affordance on screen is the UI form of
one implication; clicking it is a tend.

**Intent.** A claim about a person, so shown as a question. An entry plausibly
wants to record, vent, resolve, decide or remember. A drag on a slider
plausibly wants to correct or explore. The paper acts on an intent only above
a threshold or after a tend.

![inspector](screens/16-inspector.png)
*The log drawer: events, the running list with states, the presentation.*

## Where it goes

A web app that builds sub-apps on demand over one event-sourced model. The
soundboard of next moves is a widget the paper chose because its purpose
matched an implication. A checklist, a table, an x-y plot, a timeline across
frames are the same move with a different purpose.

| shape | purpose | summoned by |
|---|---|---|
| soundboard | pick one of a few moves fast | several open actions, no order |
| toggle pair | resolve one ambiguity | a tentative type |
| checklist | finish a known set | one action with sub-steps |
| x-y plot | track a value over time | the same measure across frames |
| table | compare many objects on shared relations | many objects of one kind |
| scratch frame | think in space | a reflection with no resolution |

**Logs are schema.** A log is a schema the paper can generate when it needs a
new kind of evidence. Event sources link to each other as queries. A widget
with declared semantics produces typed events into such a log, so its drags
become claims.

**Missing data is an intent.** When an inference lacks data, the gap becomes an
intermediate intention: create the channel or log that would hold the missing
information, or the presentation that asks for it. Backend and frontend are
both malleable, shaped by the same visible, tendable agent intent.

## What the prototype proves

* Reload replays everything; corrections and policies persist; the drawer shows the chain.
* Animated provenance holds up with no animation library and does the explaining.
* "Not a task" feels like manipulating the interpretation, not editing metadata.
* Holding back one agent intention changes proposals and nothing else.
* Typographic and spatial placement coexist in one frame with no mode switch.

## What it does not prove

* That the implications are good. Regex producers, one paragraph, intent as a guess per marker. A model plugs in at one seam with the same contract.
* That the list stays legible as it grows. No per-frame budget yet.
* That editing and structure can coexist in place.
* That size, weight, case and colour alone tell your words from the paper's.

## Status

Bun, React, TypeScript, Wordgard as the editor. Eighteen tests. Runs with
`bun install && bun run dev`, then *load demo*.
