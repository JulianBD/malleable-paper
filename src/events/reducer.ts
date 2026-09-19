import type { LogEvent, TextChangedPayload } from "./types"
import { DEFAULT_POLICIES, applyPolicyPatch, type Policies, type PolicyPatch } from "../automation/policies"
import { claimKey, nearKey, type Tends } from "../interpretation/implications"
import { frameId, today } from "../frames"

export type ObjType = "note" | "question" | "reflection" | "intention" | "action" | "reference"
export const OBJ_TYPES: ObjType[] = ["note", "question", "reflection", "intention", "action", "reference"]

/** Edits to segmentation. These change what the subjects are, so they are not claims. */
export interface Correction {
  objectId: string
  unstructured?: boolean
  mergedInto?: string
  splitAt?: number
}

export interface FrameState {
  id: string
  text: string
  corrections: Record<string, Correction>
  tends: Tends
  statuses: Record<string, string>
  /** Pinned placements. An object absent here is in flow. */
  pinned: Record<string, { x: number; y: number }>
  nextMovesDismissedAt: number // event index; -1 = not dismissed
  lastTextAt: number
}

export interface SourceState {
  frames: Record<string, FrameState>
  policies: Policies
  eventCount: number
}

export const DEFAULT_FRAME = frameId({ day: today(), thread: "journal" })

export function emptyFrame(id: string): FrameState {
  return { id, text: "", corrections: {}, tends: {}, statuses: {}, pinned: {}, nextMovesDismissedAt: -1, lastTextAt: -1 }
}

export const EMPTY_SOURCE: SourceState = { frames: {}, policies: DEFAULT_POLICIES, eventCount: 0 }

export function frameOf(s: SourceState, id: string = DEFAULT_FRAME): FrameState {
  return s.frames[id] ?? emptyFrame(id)
}

/** Pure fold: events → source state. Inference events are ignored on purpose. */
export function reduce(events: LogEvent[]): SourceState {
  let s: SourceState = { frames: {}, policies: DEFAULT_POLICIES, eventCount: 0 }
  events.forEach((ev, i) => {
    s = step(s, ev, i)
  })
  return { ...s, eventCount: events.length }
}

function withFrame(s: SourceState, id: string, f: (fr: FrameState) => FrameState): SourceState {
  return { ...s, frames: { ...s.frames, [id]: f(frameOf(s, id)) } }
}

function tend(fr: FrameState, key: string, state: "confirmed" | "rejected" | "deferred", ts: number): FrameState {
  return { ...fr, tends: { ...fr.tends, [key]: { state, ts } } }
}

function step(s: SourceState, ev: LogEvent, index: number): SourceState {
  const p = ev.payload as Record<string, any>
  const frame = ev.frame ?? DEFAULT_FRAME
  const id = ev.objectId
  switch (ev.kind) {
    case "text_changed": {
      const tp = ev.payload as unknown as TextChangedPayload
      return withFrame(s, frame, (fr) => ({ ...fr, text: tp.text, lastTextAt: index }))
    }
    case "frame_visited":
      return frame.includes("*") || frame.includes("|where=") ? s : withFrame(s, frame, (fr) => fr)

    case "implication_confirmed":
      return withFrame(s, frame, (fr) => tend(fr, p.key, "confirmed", ev.ts))
    case "implication_rejected":
      return withFrame(s, frame, (fr) => tend(fr, p.key, "rejected", ev.ts))
    case "implication_deferred":
      return withFrame(s, frame, (fr) => tend(fr, p.key, "deferred", ev.ts))

    // legacy correction kinds map onto tends of type claims
    case "user_rejected_type":
      return withFrame(s, frame, (fr) => tend(fr, claimKey(id!, { kind: "type", type: p.type }), "rejected", ev.ts))
    case "user_confirmed_type":
      return withFrame(s, frame, (fr) => tend(fr, claimKey(id!, { kind: "type", type: p.type }), "confirmed", ev.ts))
    case "blocks_connected":
      return withFrame(s, frame, (fr) => tend(fr, nearKey(p.a, p.b), "confirmed", ev.ts))
    case "block_grouped":
      return p.parentId ? withFrame(s, frame, (fr) => tend(fr, claimKey(id!, { kind: "parent", parentId: p.parentId }), "confirmed", ev.ts)) : s

    case "user_unstructured":
      return withFrame(s, frame, (fr) => ({ ...fr, corrections: { ...fr.corrections, [id!]: { ...(fr.corrections[id!] ?? { objectId: id! }), unstructured: p.value !== false } } }))
    case "user_merged":
      return withFrame(s, frame, (fr) => ({ ...fr, corrections: { ...fr.corrections, [id!]: { ...(fr.corrections[id!] ?? { objectId: id! }), mergedInto: p.previousId } } }))
    case "user_split":
      return withFrame(s, frame, (fr) => ({ ...fr, corrections: { ...fr.corrections, [id!]: { ...(fr.corrections[id!] ?? { objectId: id! }), splitAt: p.at } } }))

    case "action_clicked": {
      if (p.action === "dismiss_next_moves") return withFrame(s, frame, (fr) => ({ ...fr, nextMovesDismissedAt: index }))
      if (!id) return s
      return withFrame(s, frame, (fr) => {
        const statuses = { ...fr.statuses }
        if (p.action === "clear") delete statuses[id]
        else statuses[id] = p.action
        return { ...fr, statuses }
      })
    }
    case "automation_policy_changed":
      return { ...s, policies: applyPolicyPatch(s.policies, p.patch as PolicyPatch) }

    case "block_pinned":
    case "block_moved":
      return withFrame(s, frame, (fr) => {
        const pinned = { ...fr.pinned }
        if (p.x == null) delete pinned[id!]
        else pinned[id!] = { x: p.x, y: p.y }
        return { ...fr, pinned }
      })

    case "implications_ran":
    case "interpretation_ran":
    case "page_rendered":
      return s // instrumentation only, never authoritative
    default:
      return s
  }
}
