import type { LogEvent, TextChangedPayload } from "./types"
import { DEFAULT_POLICIES, applyPolicyPatch, type Policies, type PolicyPatch } from "../automation/policies"

export type ObjType = "note" | "question" | "reflection" | "intention" | "action" | "reference"
export const OBJ_TYPES: ObjType[] = ["note", "question", "reflection", "intention", "action", "reference"]

export interface Correction {
  objectId: string
  rejectedTypes: ObjType[]
  explicitType?: ObjType
  unstructured?: boolean
  mergedInto?: string // id of the previous object this one was combined with
  splitAt?: number // offset inside the object's source text
}

export interface SpatialState {
  positions: Record<string, { x: number; y: number }>
  connections: Array<[string, string]>
  groupedUnder: Record<string, string> // childId -> parentId (round-trips into the document)
}

export interface SourceState {
  text: string
  corrections: Record<string, Correction>
  policies: Policies
  statuses: Record<string, string> // objectId -> "done" | "later" | "kept" | ...
  nextMovesDismissed: boolean
  spatial: SpatialState
  eventCount: number
}

export const EMPTY_SOURCE: SourceState = {
  text: "",
  corrections: {},
  policies: DEFAULT_POLICIES,
  statuses: {},
  nextMovesDismissed: false,
  spatial: { positions: {}, connections: [], groupedUnder: {} },
  eventCount: 0,
}

function correction(state: SourceState, id: string): Correction {
  return state.corrections[id] ?? { objectId: id, rejectedTypes: [] }
}

/** Pure fold: events → source state. Inference events are ignored on purpose. */
export function reduce(events: LogEvent[]): SourceState {
  let s: SourceState = { ...EMPTY_SOURCE, corrections: {}, statuses: {}, spatial: { positions: {}, connections: [], groupedUnder: {} } }
  for (const ev of events) {
    s = step(s, ev)
  }
  return { ...s, eventCount: events.length }
}

function step(s: SourceState, ev: LogEvent): SourceState {
  const p = ev.payload as Record<string, any>
  switch (ev.kind) {
    case "text_changed": {
      const tp = ev.payload as unknown as TextChangedPayload
      // A text change re-opens next moves and resets transient statuses.
      return { ...s, text: tp.text, nextMovesDismissed: false }
    }
    case "user_rejected_type": {
      const c = correction(s, ev.objectId!)
      const rejected = c.rejectedTypes.includes(p.type) ? c.rejectedTypes : [...c.rejectedTypes, p.type]
      return { ...s, corrections: { ...s.corrections, [c.objectId]: { ...c, rejectedTypes: rejected, explicitType: undefined } } }
    }
    case "user_confirmed_type": {
      const c = correction(s, ev.objectId!)
      return { ...s, corrections: { ...s.corrections, [c.objectId]: { ...c, explicitType: p.type, unstructured: false } } }
    }
    case "user_unstructured": {
      const c = correction(s, ev.objectId!)
      return { ...s, corrections: { ...s.corrections, [c.objectId]: { ...c, unstructured: p.value !== false } } }
    }
    case "user_merged": {
      const c = correction(s, ev.objectId!)
      return { ...s, corrections: { ...s.corrections, [c.objectId]: { ...c, mergedInto: p.previousId } } }
    }
    case "user_split": {
      const c = correction(s, ev.objectId!)
      return { ...s, corrections: { ...s.corrections, [c.objectId]: { ...c, splitAt: p.at } } }
    }
    case "action_clicked": {
      if (p.action === "dismiss_next_moves") return { ...s, nextMovesDismissed: true }
      if (!ev.objectId) return s
      const statuses = { ...s.statuses }
      if (p.action === "clear") delete statuses[ev.objectId]
      else statuses[ev.objectId] = p.action
      return { ...s, statuses }
    }
    case "automation_policy_changed": {
      return { ...s, policies: applyPolicyPatch(s.policies, p.patch as PolicyPatch) }
    }
    case "block_moved": {
      return { ...s, spatial: { ...s.spatial, positions: { ...s.spatial.positions, [ev.objectId!]: { x: p.x, y: p.y } } } }
    }
    case "blocks_connected": {
      const pair: [string, string] = [p.a, p.b]
      const exists = s.spatial.connections.some(([a, b]) => (a === p.a && b === p.b) || (a === p.b && b === p.a))
      return exists ? s : { ...s, spatial: { ...s.spatial, connections: [...s.spatial.connections, pair] } }
    }
    case "block_grouped": {
      const groupedUnder = { ...s.spatial.groupedUnder }
      if (p.parentId) groupedUnder[ev.objectId!] = p.parentId
      else delete groupedUnder[ev.objectId!]
      return { ...s, spatial: { ...s.spatial, groupedUnder } }
    }
    case "interpretation_ran":
      return s // system inference is observability only, never authoritative
    default:
      return s
  }
}
