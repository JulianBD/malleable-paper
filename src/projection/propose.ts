// Doer half of the projection: agent intentions (policy) × implication list → proposals.
// A proposal is the UI form of one or more implications. Clicking it tends them.
// Nothing here changes presentation; it only offers.

import type { FrameState } from "../events/reducer"
import { holds, type Policies, type AgentIntentionId } from "../automation/policies"
import type { Implication } from "../interpretation/implications"
import type { Interpretation } from "../interpretation/types"
import type { Label } from "../interpretation/types"

export type Proposal =
  | { id: string; shape: "toggle"; intention: AgentIntentionId; subject: string; key: string; question: string }
  | { id: string; shape: "soundboard"; intention: AgentIntentionId; moves: Array<{ objectId: string; key: string; label: Label }> }
  | { id: string; shape: "connect"; intention: AgentIntentionId; a: string; b: string; key: string }
  | { id: string; shape: "nest"; intention: AgentIntentionId; child: string; parent: string; key: string }

export function propose(interp: Interpretation, frame: FrameState, policies: Policies): Proposal[] {
  const out: Proposal[] = []
  const byKey = new Map(interp.implications.map((i) => [i.key, i]))
  const obj = (id: string) => interp.objects.find((o) => o.id === id)

  if (holds(policies, "ask-about-tentative")) {
    for (const o of interp.objects) {
      if (o.unstructured || o.confirmedType || o.inferredType === "note" || o.confidence >= 0.65) continue
      const key = `${o.id}|type=${o.inferredType}`
      const imp = byKey.get(key)
      if (imp && imp.state === "proposed") {
        out.push({ id: `toggle-${o.id}`, shape: "toggle", intention: "ask-about-tentative", subject: o.id, key, question: `${/^[aeiou]/.test(o.inferredType) ? "an" : "a"} ${o.inferredType}?` })
      }
    }
  }

  if (holds(policies, "surface-next-moves")) {
    const moves = interp.objects
      .filter((o) => !o.unstructured && o.inferredType === "action" && o.status !== "done")
      .map((o) => ({ o, imp: byKey.get(`${o.id}|intent=resolve`) }))
      .filter(({ imp }) => imp && (imp.state === "proposed" || imp.state === "confirmed") && imp.confidence >= 0.6)
      .map(({ o, imp }) => ({ objectId: o.id, key: imp!.key, label: { text: o.displayText, kind: "authored" as const, range: o.displayRange } }))
    if (moves.length) out.push({ id: "soundboard", shape: "soundboard", intention: "surface-next-moves", moves })
  }

  // A nesting proposal for a pair outranks a nearness proposal for the same pair.
  const nested = new Set(interp.implications.filter((i) => i.claim.kind === "parent" && i.state !== "rejected").map((i) => [i.subject, (i.claim as { parentId: string }).parentId].sort().join("+")))
  if (holds(policies, "offer-connections")) {
    for (const i of interp.implications) {
      if (i.claim.kind === "near" && i.state === "proposed" && obj(i.subject) && obj(i.claim.otherId) && !nested.has([i.subject, i.claim.otherId].sort().join("+"))) {
        out.push({ id: `connect-${i.key}`, shape: "connect", intention: "offer-connections", a: i.subject, b: i.claim.otherId, key: i.key })
      }
    }
  }

  if (holds(policies, "offer-nesting")) {
    for (const i of interp.implications) {
      if (i.claim.kind === "parent" && i.producer === "scanner" && i.state === "proposed") {
        out.push({ id: `nest-${i.key}`, shape: "nest", intention: "offer-nesting", child: i.subject, parent: i.claim.parentId, key: i.key })
      }
    }
  }
  return out
}

export function implicationsFor(interp: Interpretation, subject: string): Implication[] {
  return interp.implications.filter((i) => i.subject === subject || (i.claim.kind === "near" && i.claim.otherId === subject))
}
