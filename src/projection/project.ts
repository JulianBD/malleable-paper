// Projection: interpretation → what to render. Owns treatment, affordances,
// nesting, section order. Owns no authored content: every `text` below is an
// exact substring of the source, and every generated word is marked as such.

import type { ObjType, SourceState } from "../events/reducer"
import type { Interpretation, InterpretedObject, Label } from "../interpretation/types"

export interface Affordance {
  id: string
  label: string // generated language
}

export interface Block {
  id: string
  text: string // exact authored substring shown
  sourceText: string
  type: ObjType
  confidence: number
  tentative: boolean
  confirmed: boolean
  status?: string
  treatment: "bullet" | "prose"
  affordances: Affordance[]
  children: Block[]
  connections: string[]
  splitCandidates: number[] // offsets into sourceText where a split makes sense
  hasPrevious: boolean
  previousId?: string
  reason: string
}

export interface Section {
  id: string
  label: Label | null
  kind: "topic" | "open" | "as-written" | "other"
  blocks: Block[]
}

export interface NextMove {
  id: string
  objectId: string
  label: Label
}

export interface Projection {
  title: Label
  sections: Section[]
  nextMoves: NextMove[] | null
  blockById: Record<string, Block>
}

const AFFORDANCE_LABELS: Record<string, string> = {
  "think about": "Think about",
  "leave open": "Leave open",
  keep: "Keep",
  connect: "Connect",
  "make concrete": "Make concrete",
  done: "Done",
  later: "Later",
  open: "Open",
}

const SPLIT_POINTS = /\s+(and|but|because|so|instead of|then|which|while)\s+|,\s+/gi

export function project(interp: Interpretation, source: SourceState): Projection {
  const byId: Record<string, Block> = {}
  const connections = new Map<string, string[]>()
  for (const [a, b] of source.spatial.connections) {
    connections.set(a, [...(connections.get(a) ?? []), b])
    connections.set(b, [...(connections.get(b) ?? []), a])
  }

  const blocks = interp.objects.map((o, i) => toBlock(o, interp.objects[i - 1], connections.get(o.id) ?? []))
  for (const b of blocks) byId[b.id] = b

  // Nest children under parents.
  const roots: Block[] = []
  const parentOf = new Map(interp.objects.map((o) => [o.id, o.parentId]))
  for (const b of blocks) {
    const pid = parentOf.get(b.id)
    if (pid && byId[pid]) byId[pid].children.push(b)
    else roots.push(b)
  }

  const groupOf = new Map(interp.objects.map((o) => [o.id, o.groupId]))
  const sections: Section[] = interp.groups
    .map((g): Section => ({
      id: g.id,
      label: g.label,
      kind: g.id === "open" ? "open" : g.id === "as-written" ? "as-written" : g.id.startsWith("topic-") ? "topic" : "other",
      blocks: roots.filter((b) => groupOf.get(b.id) === g.id),
    }))
    .filter((s) => s.blocks.length > 0)

  const actions = interp.objects.filter((o) => !o.unstructured && o.inferredType === "action" && o.status !== "done")
  const nextMoves: NextMove[] | null =
    source.nextMovesDismissed || actions.length === 0
      ? null
      : actions.map((o) => ({ id: `move-${o.id}`, objectId: o.id, label: { text: o.displayText, kind: "authored", range: o.displayRange } }))

  return { title: { text: "Today", kind: "generated" }, sections, nextMoves, blockById: byId }
}

function toBlock(o: InterpretedObject, previous: InterpretedObject | undefined, connections: string[]): Block {
  const splitCandidates: number[] = []
  SPLIT_POINTS.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = SPLIT_POINTS.exec(o.sourceText))) if (m.index > 3 && m.index + m[0].length < o.sourceText.length - 3) splitCandidates.push(m.index)

  return {
    id: o.id,
    text: o.displayText,
    sourceText: o.sourceText,
    type: o.inferredType,
    confidence: o.confidence,
    tentative: !o.explicitTypeOverride && o.inferredType !== "note" && o.confidence < 0.65,
    confirmed: !!o.explicitTypeOverride,
    status: o.status,
    treatment: o.unstructured ? "prose" : "bullet",
    affordances: o.unstructured ? [] : o.suggestedActions.map((a) => ({ id: a, label: AFFORDANCE_LABELS[a] ?? a })),
    children: [],
    connections,
    splitCandidates,
    hasPrevious: !!previous && previous.paragraphIndex === o.paragraphIndex,
    previousId: previous && previous.paragraphIndex === o.paragraphIndex ? previous.id : undefined,
    reason: o.reason,
  }
}

/** Motion parameters derived from confidence. Lower confidence moves slower and settles softer. */
export function motionFor(confidence: number): { duration: number; easing: string } {
  if (confidence >= 0.8) return { duration: 520, easing: "cubic-bezier(.2,.8,.2,1)" }
  if (confidence >= 0.65) return { duration: 640, easing: "cubic-bezier(.3,.7,.2,1)" }
  return { duration: 820, easing: "cubic-bezier(.4,.5,.3,1)" }
}
