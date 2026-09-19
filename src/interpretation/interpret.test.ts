import { describe, expect, test } from "bun:test"
import { interpret } from "./interpret"
import { present } from "../projection/present"
import { propose } from "../projection/propose"
import { claimKey, nearKey, type Tends } from "./implications"
import { emptyFrame, reduce, type FrameState } from "../events/reducer"
import { DEFAULT_POLICIES, applyPolicyPatch, parseCommand, type Policies } from "../automation/policies"
import type { LogEvent } from "../events/types"

const DEMO =
  "I slept kind of badly again and I think I stayed up too late scrolling. Work was fine but I kept avoiding the one thing I actually needed to finish. I felt better after walking to get coffee though. I should probably text Sam back because I've left that sitting for two days. I also keep thinking I want to do something different with my weekends instead of losing Saturday mornings."

const base: FrameState = { ...emptyFrame("0,0"), text: DEMO }
const withTends = (tends: Tends): FrameState => ({ ...base, tends })
type Row = [string, string, string[]]
const sectionsOf = (fr: FrameState, p: Policies = DEFAULT_POLICIES): Array<[string | null, Row[]]> =>
  present(interpret(fr, p), fr).sections.map((s) => [s.label?.text ?? null, s.blocks.map((b): Row => [b.text, b.type, b.children.map((c) => c.text)])])
const moves = (fr: FrameState, p: Policies = DEFAULT_POLICIES) => {
  const sb = propose(interpret(fr, p), fr, p).find((x) => x.shape === "soundboard")
  return sb && sb.shape === "soundboard" ? sb.moves.map((m) => m.label.text) : null
}

describe("reader: interpreter on the demo paragraph", () => {
  const interp = interpret(base, DEFAULT_POLICIES)
  test("every displayed phrase and label is an exact authored substring", () => {
    for (const o of interp.objects) {
      expect(DEMO.slice(o.sourceRange.from, o.sourceRange.to)).toBe(o.sourceText)
      expect(DEMO.slice(o.displayRange.from, o.displayRange.to)).toBe(o.displayText)
    }
    for (const g of interp.groups) if (g.label?.range) expect(DEMO.slice(g.label.range.from, g.label.range.to)).toBe(g.label.text)
  })
  test("groups the material as the case study expects", () => {
    expect(sectionsOf(base)).toEqual([
      ["Sleep", [["slept kind of badly again", "note", []], ["stayed up too late scrolling", "note", []]]],
      ["Work", [["Work was fine", "note", []], ["kept avoiding the one thing I actually needed to finish", "note", []]]],
      ["felt better after", [["walking to get coffee", "note", []]]],
      ["Open", [["text Sam back", "action", ["left that sitting for two days"]], ["want to do something different with my weekends", "action", ["losing Saturday mornings"]]]],
    ])
  })
  test("the implication list holds every type candidate with a state, and the winner is proposed", () => {
    const want = interp.objects.find((o) => o.displayText.startsWith("want to"))!
    const mine = interp.implications.filter((i) => i.subject === want.id && i.claim.kind === "type")
    expect(mine.map((i) => [i.claim.kind === "type" ? i.claim.type : "", i.state])).toEqual([["action", "proposed"], ["reflection", "superseded"], ["intention", "superseded"], ["note", "superseded"]])
    expect(mine.every((i) => i.key === `${want.id}|type=${(i.claim as any).type}`)).toBe(true)
  })
  test("intent is a claim too: an action wants resolve, a feeling wants record", () => {
    const sam = interp.objects.find((o) => o.displayText === "text Sam back")!
    const slept = interp.objects[0]
    expect(sam.intent).toBe("resolve")
    expect(slept.intent).toBe("record")
    expect(interp.implications.some((i) => i.key === `${sam.id}|intent=resolve` && i.state === "proposed")).toBe(true)
  })
  test("ids are stable across policy changes", () => {
    const a = interp.objects.map((o) => o.id)
    const b = interpret(base, applyPolicyPatch(DEFAULT_POLICIES, { actionInference: "explicit-only" })).objects.map((o) => o.id)
    expect(b).toEqual(a)
  })
})

describe("tending is durable and changes reader and doer", () => {
  const want = interpret(base, DEFAULT_POLICIES).objects.find((o) => o.displayText.startsWith("want to"))!
  const rejectAction = withTends({ [claimKey(want.id, { kind: "type", type: "action" })]: { state: "rejected", ts: 1 } })

  test("rejecting the action claim moves the block into the authored 'keep thinking' section and out of next moves", () => {
    const sections = sectionsOf(rejectAction)
    expect(sections.find(([l]) => l === "Open")![1]).toHaveLength(1)
    expect(sections.find(([l]) => l === "keep thinking")![1][0]).toEqual(["want to do something different with my weekends", "reflection", ["losing Saturday mornings"]])
    expect(moves(rejectAction)).toEqual(["text Sam back"])
  })
  test("the rejected claim stays on the list as rejected and is not proposed again", () => {
    const imp = interpret(rejectAction, DEFAULT_POLICIES).implications.find((i) => i.key === claimKey(want.id, { kind: "type", type: "action" }))!
    expect(imp.state).toBe("rejected")
  })
  test("deferring the resolve intent removes the move (leave this alone)", () => {
    const sam = interpret(base, DEFAULT_POLICIES).objects.find((o) => o.displayText === "text Sam back")!
    const fr = withTends({ [claimKey(sam.id, { kind: "intent", intent: "resolve" })]: { state: "deferred", ts: 1 }, [claimKey(want.id, { kind: "intent", intent: "resolve" })]: { state: "deferred", ts: 1 } })
    expect(moves(fr)).toBeNull()
  })
  test("legacy correction events replay onto tends", () => {
    const events: LogEvent[] = [
      { id: "1", ts: 1, eventType: "human_event", kind: "text_changed", payload: { text: DEMO, changes: [], source: "demo" } },
      { id: "2", ts: 2, eventType: "user_correction", kind: "user_rejected_type", objectId: want.id, payload: { type: "action" } },
    ]
    const fr = reduce(events).frames["0,0"]
    expect(fr.tends[claimKey(want.id, { kind: "type", type: "action" })].state).toBe("rejected")
  })
  test("combine with previous merges ranges and keeps the first id", () => {
    const [first, second] = interpret(base, DEFAULT_POLICIES).objects
    const fr = { ...base, corrections: { [second.id]: { objectId: second.id, mergedInto: first.id } } }
    const merged = interpret(fr, DEFAULT_POLICIES).objects[0]
    expect(merged.id).toBe(first.id)
    expect(merged.displayText).toBe("slept kind of badly again and I think I stayed up too late scrolling")
  })
})

describe("doer: proposals come from agent intentions × the list", () => {
  test("a tentative type gets a toggle; a confirmed one does not", () => {
    const want = interpret(base, DEFAULT_POLICIES).objects.find((o) => o.displayText.startsWith("want to"))!
    const p = propose(interpret(base, DEFAULT_POLICIES), base, DEFAULT_POLICIES)
    expect(p.find((x) => x.shape === "toggle" && x.subject === want.id)).toBeTruthy()
    const fr = withTends({ [claimKey(want.id, { kind: "type", type: "action" })]: { state: "confirmed", ts: 1 } })
    expect(propose(interpret(fr, DEFAULT_POLICIES), fr, DEFAULT_POLICIES).find((x) => x.shape === "toggle")).toBeUndefined()
  })
  test("holding back an agent intention removes its proposals without touching the reader", () => {
    const p = applyPolicyPatch(DEFAULT_POLICIES, { heldBack: ["surface-next-moves"] })
    expect(moves(base, p)).toBeNull()
    expect(sectionsOf(base, p)).toEqual(sectionsOf(base))
  })
  test("pinned nearness is a scanner implication, and confirming it is a connection", () => {
    const [a, b] = interpret(base, DEFAULT_POLICIES).objects
    const fr: FrameState = { ...base, pinned: { [a.id]: { x: 700, y: 40 }, [b.id]: { x: 700, y: 100 } } }
    const near = interpret(fr, DEFAULT_POLICIES).implications.find((i) => i.claim.kind === "near")!
    expect(near.key).toBe(nearKey(a.id, b.id))
    expect(near.state).toBe("proposed")
    expect(propose(interpret(fr, DEFAULT_POLICIES), fr, DEFAULT_POLICIES).some((p) => p.shape === "connect")).toBe(true)
    const done = { ...fr, tends: { [near.key]: { state: "confirmed" as const, ts: 1 } } }
    expect(present(interpret(done, DEFAULT_POLICIES), done).blockById[a.id].connections).toEqual([b.id])
    expect(propose(interpret(done, DEFAULT_POLICIES), done, DEFAULT_POLICIES).some((p) => p.shape === "connect")).toBe(false)
  })
  test("a confirmed parent claim from the plane re-nests the child in the flow", () => {
    const objs = interpret(base, DEFAULT_POLICIES).objects
    const child = objs[2], parent = objs[0]
    const fr = withTends({ [claimKey(child.id, { kind: "parent", parentId: parent.id })]: { state: "confirmed", ts: 1 } })
    expect(sectionsOf(fr)[0][1][0]).toEqual(["slept kind of badly again", "note", ["Work was fine"]])
  })
})

describe("steering tends the agent's intentions", () => {
  const ctx = { currentParagraphs: [0], policies: DEFAULT_POLICIES }
  test("'Don't turn casual thoughts into tasks.' → explicit-only, no Open section, no moves", () => {
    const cmd = parseCommand("Don't turn casual thoughts into tasks.", ctx)!
    const p = applyPolicyPatch(DEFAULT_POLICIES, cmd.patch)
    expect(sectionsOf(base, p).map(([l]) => l)).toEqual(["Sleep", "Work", "felt better after", "Intentions"])
    expect(moves(base, p)).toBeNull()
  })
  test("'Stop suggesting next moves.' holds back one agent intention", () => {
    const cmd = parseCommand("Stop suggesting next moves.", ctx)!
    expect(applyPolicyPatch(DEFAULT_POLICIES, cmd.patch).journal.heldBack).toEqual(["surface-next-moves"])
  })
  test("'Be more subtle' leaves notes as prose", () => {
    const cmd = parseCommand("Be more subtle with journal entries.", ctx)!
    const p = applyPolicyPatch(DEFAULT_POLICIES, cmd.patch)
    expect(interpret(base, p).objects.filter((o) => o.unstructured).length).toBe(5)
  })
  test("unknown commands do not change policy", () => {
    expect(parseCommand("make it purple", ctx)).toBeNull()
  })
})
