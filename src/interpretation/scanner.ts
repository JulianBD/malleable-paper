// Scanner producer: reads geometry the human authored (pinned placements) and
// emits implications. Geometry is weak evidence: nearness only proposes.

import type { FrameState } from "../events/reducer"
import { claimKey, nearKey, stateOf, type Implication } from "./implications"
import type { InterpretedObject } from "./types"

export const NODE_W = 300
export function estimateHeight(text: string): number {
  return 28 + Math.max(1, Math.ceil(text.length / 32)) * 24
}

interface Box { id: string; x: number; y: number; w: number; h: number }

function gap(a: Box, b: Box): number {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w))
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h))
  return Math.hypot(dx, dy)
}

export function scan(frame: FrameState, objects: InterpretedObject[]): Implication[] {
  const boxes: Box[] = objects
    .filter((o) => frame.pinned[o.id] && !o.unstructured)
    .map((o) => ({ id: o.id, x: frame.pinned[o.id].x, y: frame.pinned[o.id].y, w: NODE_W, h: estimateHeight(o.displayText) }))
  const out: Implication[] = []
  for (const a of boxes) {
    for (const b of boxes) {
      if (a.id >= b.id) continue
      const g = gap(a, b)
      if (g < 48) {
        const key = nearKey(a.id, b.id)
        out.push({ key, subject: a.id < b.id ? a.id : b.id, claim: { kind: "near", otherId: a.id < b.id ? b.id : a.id }, confidence: 0.5, basis: [a.id, b.id], producer: "scanner", state: stateOf(key, frame.tends, true), reason: `pinned ${Math.round(g)}px apart` })
      }
    }
  }
  // Dropped just under another, indented → nesting proposal.
  for (const c of boxes) {
    const under = boxes.find((p) => p.id !== c.id && c.y > p.y + p.h - 4 && c.y - (p.y + p.h) < 36 && c.x - p.x > 12 && c.x - p.x < 80)
    if (under) {
      const key = claimKey(c.id, { kind: "parent", parentId: under.id })
      out.push({ key, subject: c.id, claim: { kind: "parent", parentId: under.id }, confidence: 0.55, basis: [c.id, under.id], producer: "scanner", state: stateOf(key, frame.tends, true), reason: "dropped indented under it" })
    }
  }
  return out
}
