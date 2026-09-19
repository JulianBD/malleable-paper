// Reader half of the projection: interpretation → what to show, quietly.
// Owns treatment, nesting, section order. Owns no authored content and makes
// no proposals; those come from propose.ts (the doer half).

import type { FrameState, ObjType } from "../events/reducer"
import type { Interpretation, InterpretedObject, Label } from "../interpretation/types"
import type { Intent } from "../interpretation/implications"

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
  intent: Intent
  status?: string
  treatment: "bullet" | "prose"
  affordances: Affordance[]
  children: Block[]
  connections: string[]
  pinned: { x: number; y: number } | null
  splitCandidates: number[]
  previousId?: string
  reason: string
}

export interface Section {
  id: string
  label: Label | null
  kind: "topic" | "open" | "as-written" | "other"
  blocks: Block[]
}

export interface Presentation {
  title: Label
  sections: Section[]
  blockById: Record<string, Block>
  /** Blocks the human pinned in the frame; they are not in any section. */
  pinnedBlocks: Block[]
}

const AFFORDANCE_LABELS: Record<string, string> = {
  "think about": "think about", "leave open": "leave open", keep: "keep", connect: "connect",
  "make concrete": "make concrete", done: "done", later: "later", open: "open",
}

const SPLIT_POINTS = /\s+(and|but|because|so|instead of|then|which|while)\s+|,\s+/gi

export function present(interp: Interpretation, frame: FrameState): Presentation {
  const byId: Record<string, Block> = {}
  const connections = new Map<string, string[]>()
  for (const i of interp.implications) {
    if (i.claim.kind === "near" && i.state === "confirmed") {
      const b = i.claim.otherId
      connections.set(i.subject, [...(connections.get(i.subject) ?? []), b])
      connections.set(b, [...(connections.get(b) ?? []), i.subject])
    }
  }

  const blocks = interp.objects.map((o, i) => toBlock(o, interp.objects[i - 1], connections.get(o.id) ?? [], frame.pinned[o.id] ?? null))
  for (const b of blocks) byId[b.id] = b

  const roots: Block[] = []
  const pinnedBlocks: Block[] = []
  const parentOf = new Map(interp.objects.map((o) => [o.id, o.parentId]))
  for (const b of blocks) {
    if (b.pinned) { pinnedBlocks.push(b); continue }
    const pid = parentOf.get(b.id)
    if (pid && byId[pid] && !byId[pid].pinned) byId[pid].children.push(b)
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

  return { title: { text: "Today", kind: "generated" }, sections, blockById: byId, pinnedBlocks }
}

function toBlock(o: InterpretedObject, previous: InterpretedObject | undefined, connections: string[], pinned: { x: number; y: number } | null): Block {
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
    tentative: !o.confirmedType && o.inferredType !== "note" && o.confidence < 0.65,
    confirmed: o.confirmedType,
    intent: o.intent,
    status: o.status,
    treatment: o.unstructured ? "prose" : "bullet",
    affordances: o.unstructured ? [] : o.suggestedActions.map((a) => ({ id: a, label: AFFORDANCE_LABELS[a] ?? a })),
    children: [],
    connections,
    pinned,
    splitCandidates,
    previousId: previous && previous.paragraphIndex === o.paragraphIndex ? previous.id : undefined,
    reason: o.reason,
  }
}

/** Keep only the blocks whose id is in `keep` (or that have a kept descendant). */
export function filterPresentation(p: Presentation, keep: Set<string>): Presentation {
  const prune = (blocks: Block[]): Block[] =>
    blocks
      .map((b) => ({ ...b, children: prune(b.children) }))
      .filter((b) => keep.has(b.id) || b.children.length > 0)
  const sections = p.sections.map((s) => ({ ...s, blocks: prune(s.blocks) })).filter((s) => s.blocks.length > 0)
  return { ...p, sections, pinnedBlocks: p.pinnedBlocks.filter((b) => keep.has(b.id)) }
}
