// Reader: frame state (from the event log) → interpretation + implication list.
// This is where an LLM/agent producer would plug in. The contract it must keep:
// stable ids, exact source substrings and ranges, claims with confidence and
// basis, never rewritten text.

import type { FrameState, ObjType } from "../events/reducer"
import type { Policies } from "../automation/policies"
import { segment, trimStubs, trimRange, type Clause } from "./segment"
import { classify, SUGGESTED_ACTIONS, topicFor, UNRESOLVED, intents } from "./classify"
import { claimKey, stateOf, type Claim, type Implication, type ImplicationState } from "./implications"
import { scan } from "./scanner"
import type { Group, Interpretation, InterpretedObject, Label, Range } from "./types"

function hash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36).padStart(7, "0").slice(0, 6)
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim()
}

interface Working extends Clause {
  id: string
}

const AFTER_LABEL = /^(?:i\s+)?(felt (?:better|worse|good|bad|calmer|lighter|okay|ok) after)\s+(.+)$/i
const REFLECTION_LABEL = /\b(keep thinking|been thinking|wonder|notice|noticed|feel like|keep coming back to)\b/i

export function interpret(frame: FrameState, policies: Policies): Interpretation {
  const { text, corrections, tends } = frame
  const j = policies.journal

  // 1. Segment and assign deterministic ids from the displayed text.
  const seen = new Map<string, number>()
  let working: Working[] = segment(text).map((c) => {
    const key = normalize(text.slice(c.display.from, c.display.to))
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    return { ...c, id: `obj-${hash(key)}${n > 1 ? `-${n}` : ""}` }
  })

  // 2. Apply segmentation edits (split, merge) in base-id space.
  working = applySplits(text, working, corrections)
  working = applyMerges(text, working, corrections)

  const tendOn = (key: string) => tends[key]?.state
  const tendedType = (id: string): { confirmed?: ObjType; rejected: ObjType[] } => {
    const out = { confirmed: undefined as ObjType | undefined, rejected: [] as ObjType[] }
    for (const t of ["note", "question", "reflection", "intention", "action", "reference"] as ObjType[]) {
      const s = tendOn(claimKey(id, { kind: "type", type: t }))
      if (s === "confirmed") out.confirmed = t
      if (s === "rejected") out.rejected.push(t)
    }
    return out
  }
  const confirmedParent = (id: string): string | undefined => {
    for (const [key, t] of Object.entries(tends)) {
      if (t.state === "confirmed" && key.startsWith(`${id}|parent=`)) return key.slice(`${id}|parent=`.length)
    }
    return undefined
  }

  // 3. Classify, group, decide what to structure; emit implications as we go.
  const groups = new Map<string, Group>()
  const objects: InterpretedObject[] = []
  const implications: Implication[] = []
  let order = 0
  let lastTopicGroup: string | null = null
  let prev: InterpretedObject | null = null

  const ensureGroup = (id: string, label: Label | null) => {
    if (!groups.has(id)) groups.set(id, { id, label, order: groups.size })
    return id
  }
  const emit = (subject: string, claim: Claim, confidence: number, winner: boolean, reason: string, basis: string[] = [subject]) => {
    const key = claimKey(subject, claim)
    const state: ImplicationState = stateOf(key, tends, winner)
    implications.push({ key, subject, claim, confidence, basis, producer: "interpreter", state, reason })
    return state
  }

  for (const w of working) {
    const sourceText = text.slice(w.range.from, w.range.to)
    let display: Range = w.display
    const corr = corrections[w.id]
    const candidates = classify(sourceText, policies)
    const tended = tendedType(w.id)
    const allowed = candidates.filter((c) => !tended.rejected.includes(c.type))
    const chosen = tended.confirmed
      ? { type: tended.confirmed, score: 1, why: "confirmed by you" }
      : allowed[0] ?? { type: "note" as ObjType, score: 0.5, why: "fallback after rejections" }
    const type = chosen.type
    for (const c of candidates) emit(w.id, { kind: "type", type: c.type }, c.score, c.type === type, c.why)
    if (tended.confirmed && !candidates.some((c) => c.type === tended.confirmed)) emit(w.id, { kind: "type", type: tended.confirmed }, 1, true, "confirmed by you")

    // Authored labels: "felt better after X" → label "felt better after", display "X".
    let label: Label | null = null
    let groupId: string
    const afterMatch = AFTER_LABEL.exec(sourceText)
    const parentObj = w.relation === "child" ? prev : null
    const unresolved = type === "question" || type === "action" || UNRESOLVED.test(sourceText)

    if (parentObj) {
      groupId = parentObj.groupId
    } else if (type === "action" || type === "question") {
      groupId = ensureGroup("open", { text: "Open", kind: "generated" })
    } else if (afterMatch) {
      const lf = sourceText.toLowerCase().indexOf(afterMatch[1].toLowerCase())
      const labelRange = { from: w.range.from + lf, to: w.range.from + lf + afterMatch[1].length }
      label = { text: text.slice(labelRange.from, labelRange.to), kind: "authored", range: labelRange }
      display = trimStubs(text, trimRange(text, { from: labelRange.to, to: w.range.to }))
      groupId = ensureGroup(`authored-${normalize(label.text)}`, label)
    } else if (type === "reflection") {
      const m = REFLECTION_LABEL.exec(sourceText)
      if (m) {
        const lf = sourceText.indexOf(m[0])
        const labelRange = { from: w.range.from + lf, to: w.range.from + lf + m[0].length }
        label = { text: text.slice(labelRange.from, labelRange.to), kind: "authored", range: labelRange }
        groupId = ensureGroup(`authored-${normalize(label.text)}`, label)
      } else {
        groupId = ensureGroup("thinking", { text: "Thinking", kind: "generated" })
      }
    } else if (type === "intention") {
      groupId = ensureGroup("intentions", { text: j.intentionsAsCommitments ? "Intentions" : "Wanted", kind: "generated" })
    } else if (type === "reference") {
      groupId = ensureGroup("references", { text: "References", kind: "generated" })
    } else {
      const topic = topicFor(sourceText)
      if (topic) groupId = ensureGroup(topic.id, { text: topic.label, kind: "generated" })
      else if (w.relation === "sibling" && lastTopicGroup) groupId = lastTopicGroup
      else groupId = ensureGroup("notes", null)
    }
    if (groupId.startsWith("topic-")) lastTopicGroup = groupId
    if (w.relation === "start") lastTopicGroup = groupId.startsWith("topic-") ? groupId : null

    // Structure or leave as prose?
    let unstructured = false
    let reason = chosen.why
    if (corr?.unstructured) { unstructured = true; reason = "you asked to leave this as written" }
    else if (j.backgroundParagraphs.includes(w.paragraphIndex)) { unstructured = true; reason = "paragraph treated as background" }
    else if (parentObj?.unstructured) { unstructured = true; reason = "follows an unstructured clause" }
    else if (!parentObj && j.subtlety === "subtle" && (type === "note" || type === "reflection")) { unstructured = true; reason = "subtle policy: notes stay as prose" }
    else if (!parentObj && j.surface === "unresolved-only" && !unresolved) { unstructured = true; reason = "not explicitly unresolved (policy)" }

    if (unstructured) {
      display = w.range
      groupId = ensureGroup("as-written", null)
    } else {
      emit(w.id, { kind: "group", groupId, label: groups.get(groupId)?.label ?? null }, chosen.score, true, label ? `authored label “${label.text}”` : groupId.startsWith("topic-") ? "topic keywords" : `follows from type ${type}`)
      if (parentObj) emit(w.id, { kind: "parent", parentId: parentObj.id }, 0.7, true, `connective “${w.connective}”`)
    }

    // Intent: what the clause plausibly wants.
    const intentCands = intents(sourceText, type)
    const intentWinner = intentCands.find((c) => tendOn(claimKey(w.id, { kind: "intent", intent: c.intent })) !== "rejected") ?? intentCands[0]
    for (const c of intentCands) emit(w.id, { kind: "intent", intent: c.intent }, c.score, c === intentWinner, c.why)

    const obj: InterpretedObject = {
      id: w.id,
      sourceText,
      sourceRange: w.range,
      displayRange: display,
      displayText: text.slice(display.from, display.to),
      inferredType: type,
      confidence: tended.confirmed ? 1 : chosen.score,
      confirmedType: !!tended.confirmed,
      intent: intentWinner.intent,
      intentConfidence: intentWinner.score,
      groupId,
      parentId: parentObj && !unstructured ? parentObj.id : undefined,
      paragraphIndex: w.paragraphIndex,
      order: order++,
      status: frame.statuses[w.id],
      unstructured,
      suggestedActions: unstructured ? [] : SUGGESTED_ACTIONS[type],
      reason,
    }
    objects.push(obj)
    prev = obj
  }

  // A confirmed parent claim (e.g. from dropping a block under another) re-nests the child.
  for (const child of objects) {
    const pid = confirmedParent(child.id)
    const parent = pid ? objects.find((o) => o.id === pid) : undefined
    if (parent && !child.unstructured && !parent.unstructured && parent.parentId !== child.id) {
      child.parentId = parent.id
      child.groupId = parent.groupId
      implications.push({ key: claimKey(child.id, { kind: "parent", parentId: parent.id }), subject: child.id, claim: { kind: "parent", parentId: parent.id }, confidence: 1, basis: [child.id, parent.id], producer: "scanner", state: "confirmed", reason: "you grouped it under" })
    }
  }

  // Groups ordered by first member appearance; "as-written" last.
  const firstOrder = new Map<string, number>()
  for (const o of objects) if (!firstOrder.has(o.groupId)) firstOrder.set(o.groupId, o.order)
  const groupList = [...groups.values()]
    .filter((g) => firstOrder.has(g.id))
    .sort((a, b) => (a.id === "as-written" ? 1 : b.id === "as-written" ? -1 : firstOrder.get(a.id)! - firstOrder.get(b.id)!))
    .map((g, i) => ({ ...g, order: i }))

  // Scanner producer: geometry → near / parent proposals (only for pinned objects).
  const scanned = scan(frame, objects).filter((s) => !implications.some((i) => i.key === s.key))

  return { text, objects, groups: groupList, glue: computeGlue(text.length, objects, groupList), implications: [...implications, ...scanned] }
}

function computeGlue(length: number, objects: InterpretedObject[], groups: Group[]): Range[] {
  const spans = [
    ...objects.map((o) => o.displayRange),
    ...groups.flatMap((g) => (g.label?.range ? [g.label.range] : [])),
  ].sort((a, b) => a.from - b.from)
  const glue: Range[] = []
  let cursor = 0
  for (const s of spans) {
    if (s.from > cursor) glue.push({ from: cursor, to: s.from })
    cursor = Math.max(cursor, s.to)
  }
  if (cursor < length) glue.push({ from: cursor, to: length })
  return glue
}

function applySplits(text: string, list: Working[], corrections: FrameState["corrections"]): Working[] {
  const out: Working[] = []
  for (const w of list) {
    const at = corrections[w.id]?.splitAt
    if (at && at > 0 && w.range.from + at < w.range.to) {
      const cut = w.range.from + at
      const trim = (r: Range) => {
        let { from, to } = r
        while (from < to && /[\s,;]/.test(text[from])) from++
        while (to > from && /[\s,;]/.test(text[to - 1])) to--
        return { from, to }
      }
      const ra = trim({ from: w.range.from, to: cut }), rb = trim({ from: cut, to: w.range.to })
      out.push({ ...w, range: ra, display: trimStubs(text, { from: Math.max(w.display.from, ra.from), to: ra.to }) })
      out.push({ ...w, id: `${w.id}.2`, range: rb, display: trimStubs(text, rb), relation: "sibling", connective: undefined })
    } else out.push(w)
  }
  return out
}

function applyMerges(text: string, list: Working[], corrections: FrameState["corrections"]): Working[] {
  const out: Working[] = []
  for (const w of list) {
    const into = corrections[w.id]?.mergedInto
    const prev = out[out.length - 1]
    if (into && prev && prev.id === into) {
      out[out.length - 1] = { ...prev, range: { from: prev.range.from, to: w.range.to }, display: { from: prev.display.from, to: w.range.to } }
    } else out.push(w)
  }
  return out
}

/** Compact summary for the instrumentation event. */
export function summarize(interp: Interpretation) {
  return interp.implications
    .filter((i) => i.state === "proposed" || i.state === "confirmed")
    .map((i) => ({ key: i.key, confidence: Number(i.confidence.toFixed(2)), state: i.state }))
}
