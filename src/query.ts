// Content is in a frame by query. Every authored object carries keys: the
// coordinate it was written in, and every claim the reader holds about it.
// A `where` clause selects objects by one key; the frame renders the result.

import type { FrameState } from "./events/reducer"
import type { Interpretation, InterpretedObject } from "./interpretation/types"
import { parseWhere } from "./frames"

/** Does this object satisfy the where clause, given its frame's reading? */
export function objectMatches(where: string | undefined, o: InterpretedObject, interp: Interpretation, frame: FrameState): boolean {
  const w = parseWhere(where)
  if (!w) return true
  switch (w.key) {
    case "mention":
      return new RegExp(`\\b${w.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(o.sourceText)
    case "status":
      return (frame.statuses[o.id] ?? "") === w.value
    case "text":
      return o.sourceText.toLowerCase().includes(w.value)
    default: {
      // type=, group=, intent=, parent=, near=: a live claim on this object.
      const claim = `${w.key}=${w.value}`
      return interp.implications.some((i) => i.subject === o.id && i.key.endsWith(`|${claim}`) && (i.state === "proposed" || i.state === "confirmed"))
    }
  }
}

/** The ids a where clause selects from one frame's reading. */
export function selectIds(where: string | undefined, interp: Interpretation, frame: FrameState): string[] {
  return interp.objects.filter((o) => objectMatches(where, o, interp, frame)).map((o) => o.id)
}
