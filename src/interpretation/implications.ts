// The implication list: data in, plausible implications out, as a running list.
// Every implication has a stable key = subject|claim, so the same implication
// re-emitted later is the same implication and a human tend on it outlives
// every re-emission.

import type { ObjType } from "../events/reducer"
import type { Label } from "./types"

export type Intent = "record" | "vent" | "resolve" | "decide" | "remember" | "correct" | "explore"

export type Claim =
  | { kind: "type"; type: ObjType }
  | { kind: "group"; groupId: string; label: Label | null }
  | { kind: "parent"; parentId: string }
  | { kind: "near"; otherId: string }
  | { kind: "intent"; intent: Intent }

export type TendState = "confirmed" | "rejected" | "deferred"
export type ImplicationState = "proposed" | TendState | "superseded" | "withdrawn"

export interface Implication {
  key: string
  subject: string
  claim: Claim
  confidence: number
  /** Event ids or object ids the implication rests on. */
  basis: string[]
  producer: "interpreter" | "scanner"
  state: ImplicationState
  reason: string
}

export function claimText(c: Claim): string {
  switch (c.kind) {
    case "type": return `type=${c.type}`
    case "group": return `group=${c.groupId}`
    case "parent": return `parent=${c.parentId}`
    case "near": return `near=${c.otherId}`
    case "intent": return `intent=${c.intent}`
  }
}

export function claimKey(subject: string, claim: Claim): string {
  return `${subject}|${claimText(claim)}`
}

export function nearKey(a: string, b: string): string {
  const [x, y] = [a, b].sort()
  return claimKey(x, { kind: "near", otherId: y })
}

export type Tends = Record<string, { state: TendState; ts: number }>

export function stateOf(key: string, tends: Tends, winner: boolean): ImplicationState {
  const t = tends[key]
  if (t) return t.state
  return winner ? "proposed" : "superseded"
}
