// Content is in a frame by query. Every object carries keys as triples
// (object, key, value): the coordinate it was written in, and every claim the
// reader holds about it. A widget carries the keys it was created with. A
// where clause is a conjunction of patterns (?x key value); the frame renders
// the return set.

import type { FrameState, Widget } from "./events/reducer"
import type { Interpretation, InterpretedObject } from "./interpretation/types"
import { parseFrameId, parseWhere, normTag, matchValue, type Pattern } from "./frames"

export interface Triple { s: string; p: string; o: string }

/** Every triple an authored object carries, given its frame's reading. */
export function triplesOf(o: InterpretedObject, interp: Interpretation, frame: FrameState): Triple[] {
  const c = parseFrameId(frame.id)
  const out: Triple[] = [
    { s: o.id, p: "day", o: c.day },
    { s: o.id, p: "thread", o: c.thread },
  ]
  for (const i of interp.implications) {
    if (i.subject === o.id && (i.state === "proposed" || i.state === "confirmed")) {
      const [p, v] = i.key.split("|")[1].split("=")
      out.push({ s: o.id, p, o: v })
    }
  }
  if (frame.statuses[o.id]) out.push({ s: o.id, p: "status", o: frame.statuses[o.id] })
  for (const m of o.sourceText.match(/\b[A-Z][a-z]+\b/g) ?? []) if (!/^(I|Work|Why|Sam|Slept|Sent|Standup|The)$/.test(m) || m === "Sam") out.push({ s: o.id, p: "mention", o: m.toLowerCase() })
  return out
}

export function triplesOfWidget(w: Widget, frame: FrameState): Triple[] {
  const c = parseFrameId(frame.id)
  return [
    { s: w.id, p: "day", o: c.day },
    { s: w.id, p: "thread", o: c.thread },
    { s: w.id, p: "kind", o: normTag(w.kind) },
    ...w.tags.map((t) => ({ s: w.id, p: "about", o: normTag(t) })),
  ]
}

function satisfies(triples: Triple[], text: string, pats: Pattern[]): boolean {
  return pats.every((pat) => {
    if (pat.key === "text") return text.toLowerCase().includes(pat.value)
    return triples.some((t) => t.p === pat.key && matchValue(pat.value, normTag(t.o)))
  })
}

/** Does this object satisfy the where clause, given its frame's reading? */
export function objectMatches(where: string | undefined, o: InterpretedObject, interp: Interpretation, frame: FrameState): boolean {
  const pats = parseWhere(where)
  if (!pats.length) return true
  return satisfies(triplesOf(o, interp, frame), o.sourceText, pats)
}

export function widgetMatches(where: string | undefined, w: Widget, frame: FrameState): boolean {
  const pats = parseWhere(where)
  if (!pats.length) return true
  return satisfies(triplesOfWidget(w, frame), `${w.kind} ${w.tags.join(" ")}`, pats)
}

/** The ids a where clause selects from one frame's reading: authored objects and widgets. */
export function selectIds(where: string | undefined, interp: Interpretation, frame: FrameState): string[] {
  return [
    ...interp.objects.filter((o) => objectMatches(where, o, interp, frame)).map((o) => o.id),
    ...Object.values(frame.widgets).filter((w) => widgetMatches(where, w, frame)).map((w) => w.id),
  ]
}
