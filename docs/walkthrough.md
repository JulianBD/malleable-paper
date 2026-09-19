# Walkthrough — the paper writes back

Every frame below was captured from the running prototype at 2× scale by
`docs/walk.ts` (Playwright). The sequence is one session: write, watch,
tend, steer, pin, connect, nest, hold raw, inspect, move to the next frame.

## 1. Writing

The paper starts empty. There is no chrome: a frame id, a state word, two
text buttons, a hint line, and a command line at the bottom.

![empty](screens/01-empty.png)

A messy paragraph goes into the Wordgard editor. The state word says
*reading* while the two-second idle timer runs.

![writing](screens/02-writing.png)

## 2. The paper writes back

**Lift.** The exact spans that will move are highlighted where they sit in the
paragraph. Everything else is glue and starts to fade.

![lift](screens/03-lift.png)

**Move.** The same spans fly to their places. Nothing else is drawn yet: no
headings, no markers, no buttons. Whitespace opens between the groups.

![move](screens/04-move.png)

**Settle.** Markers and colour arrive. Typography changes only now.

![settle](screens/05-settle.png)

**Structured.** Generated headings (*Sleep*, *Work*, *Open*) and the authored
heading *Felt better after* are in. The soft action gets a question,
*an action? yes / no*, and the doer proposes two next moves.

![structured](screens/06-structured.png)

## 3. Tending

Hover a block: its affordances (*done / later*) and the ⋯ appear.

![hover](screens/07-hover.png)

The ⋯ menu is the tend menu. Below the actions it lists the implications the
paper holds about this block, with state, confidence and reason.

![tend menu](screens/08-tend-menu.png)

Press **no** on *an action?*. The block leaves *Open* and settles under the
authored heading *Keep thinking* as a reflection. Its next move is gone.
The rejection is durable: that claim is never proposed again for this phrase.

![after no](screens/09-after-no.png)

## 4. Steering

Press **/**. The command line wakes and shows the seed commands. This is the
whole chat: it tends the agent's intentions, it never talks.

![command](screens/10-command.png)

*Don't turn casual thoughts into tasks.* → `actionInference → explicit-only`.
*Open* becomes *Intentions* with diamond markers; no next moves.

![steered](screens/11-steered.png)

## 5. The plane

Drag a phrase out of the column and it is pinned where you drop it. Drag a
second one near it and the scanner emits `a|near=b`; the doer offers
*connect these?*.

![pinned near](screens/12-pinned-near.png)

Confirming it is the connection: a dotted teal line and a *connected* tag.
Dropping a third block indented under another offers *group under?*.

![nest offer](screens/13-nest-offer.png)

Confirming re-nests the child. Everything on the plane is the same object it
was in the column.

![connected and nested](screens/14-connected-nested.png)

## 6. Raw

Hold **Space**: the original paragraph shows through the structure, spans in
place, glue in blue.

![raw hold](screens/15-raw-hold.png)

## 7. The log

The drawer shows the three stores side by side: events (authoritative), the
implication list with states, the presentation and the proposals.

![inspector](screens/16-inspector.png)

## 8. Frames

The margin arrows or the arrow keys move to the adjacent frame on the plane.
Each frame has its own text, tends and pins.

![frame right empty](screens/17-frame-right-empty.png)

![frame right](screens/18-frame-right.png)

## Design notes for the next round

* Authored vs generated now rests on size, weight, case and colour alone.
* Markers are geometry: disc note, square action, ring question, diamond
  reflection, filled diamond intention, triangle reference. Green when
  confirmed.
* Pastel pairs: blue machine, amber open, green human, rose attention, violet
  intent, teal links. No greys anywhere.
* The command line sticks to the bottom so `/` never scrolls the paper.
