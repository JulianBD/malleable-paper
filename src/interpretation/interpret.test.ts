import { describe, expect, test } from "bun:test"
import { interpret } from "./interpret"
import { project } from "../projection/project"
import { EMPTY_SOURCE, type SourceState } from "../events/reducer"
import { DEFAULT_POLICIES, applyPolicyPatch, parseCommand } from "../automation/policies"

const DEMO =
  "I slept kind of badly again and I think I stayed up too late scrolling. Work was fine but I kept avoiding the one thing I actually needed to finish. I felt better after walking to get coffee though. I should probably text Sam back because I've left that sitting for two days. I also keep thinking I want to do something different with my weekends instead of losing Saturday mornings."

const base: SourceState = { ...EMPTY_SOURCE, text: DEMO }
type Row = [string, string, string[]]
const sectionsOf = (src: SourceState): Array<[string | null, Row[]]> =>
  project(interpret(src), src).sections.map((s) => [s.label?.text ?? null, s.blocks.map((b): Row => [b.text, b.type, b.children.map((c) => c.text)])])

describe("interpreter on the demo paragraph", () => {
  const interp = interpret(base)

  test("every displayed phrase is an exact authored substring", () => {
    for (const o of interp.objects) {
      expect(DEMO.slice(o.sourceRange.from, o.sourceRange.to)).toBe(o.sourceText)
      expect(DEMO.slice(o.displayRange.from, o.displayRange.to)).toBe(o.displayText)
      expect(o.displayRange.from).toBeGreaterThanOrEqual(o.sourceRange.from)
      expect(o.displayRange.to).toBeLessThanOrEqual(o.sourceRange.to)
    }
    for (const g of interp.groups) if (g.label?.range) expect(DEMO.slice(g.label.range.from, g.label.range.to)).toBe(g.label.text)
  })

  test("groups the material as the case study expects", () => {
    expect(sectionsOf(base)).toEqual([
      ["Sleep", [["slept kind of badly again", "note", []], ["stayed up too late scrolling", "note", []]]],
      ["Work", [["Work was fine", "note", []], ["kept avoiding the one thing I actually needed to finish", "note", []]]],
      ["felt better after", [["walking to get coffee", "note", []]]],
      ["Open", [
        ["text Sam back", "action", ["left that sitting for two days"]],
        ["want to do something different with my weekends", "action", ["losing Saturday mornings"]],
      ]],
    ])
  })

  test("the soft 'I want to' action is tentative, the 'I should' action is not", () => {
    const want = interp.objects.find((o) => o.displayText.startsWith("want to"))!
    const sam = interp.objects.find((o) => o.displayText === "text Sam back")!
    expect(want.confidence).toBeLessThan(0.65)
    expect(sam.confidence).toBeGreaterThanOrEqual(0.8)
  })

  test("ids are stable across policy changes and corrections", () => {
    const a = interp.objects.map((o) => o.id)
    const b = interpret({ ...base, policies: applyPolicyPatch(DEFAULT_POLICIES, { actionInference: "explicit-only" }) }).objects.map((o) => o.id)
    expect(b).toEqual(a)
  })
})

describe("corrections are durable and change the projection", () => {
  const want = interpret(base).objects.find((o) => o.displayText.startsWith("want to"))!

  test("'not a task' moves the block out of Open into the authored 'keep thinking' section", () => {
    const src = { ...base, corrections: { [want.id]: { objectId: want.id, rejectedTypes: ["action" as const] } } }
    const sections = sectionsOf(src)
    expect(sections.find(([l]) => l === "Open")![1]).toHaveLength(1)
    expect(sections.find(([l]) => l === "keep thinking")![1][0]).toEqual(["want to do something different with my weekends", "reflection", ["losing Saturday mornings"]])
    expect(project(interpret(src), src).nextMoves?.map((m) => m.label.text)).toEqual(["text Sam back"])
  })

  test("the same inference is not made again after rejection", () => {
    const src = { ...base, corrections: { [want.id]: { objectId: want.id, rejectedTypes: ["action" as const] } } }
    expect(interpret(src).objects.find((o) => o.id === want.id)!.inferredType).not.toBe("action")
  })

  test("combine with previous merges ranges and keeps the first id", () => {
    const [first, second] = interpret(base).objects
    const src = { ...base, corrections: { [second.id]: { objectId: second.id, rejectedTypes: [], mergedInto: first.id } } }
    const merged = interpret(src).objects[0]
    expect(merged.id).toBe(first.id)
    expect(merged.displayText).toBe("slept kind of badly again and I think I stayed up too late scrolling")
  })
})

describe("steering changes policy, and policy changes the projection", () => {
  test("'Don't turn casual thoughts into tasks.' → explicit-only, no Open section, no next moves", () => {
    const cmd = parseCommand("Don't turn casual thoughts into tasks.", { currentParagraphs: [0] })!
    const src = { ...base, policies: applyPolicyPatch(DEFAULT_POLICIES, cmd.patch) }
    expect(src.policies.journal.actionInference).toBe("explicit-only")
    expect(sectionsOf(src).map(([l]) => l)).toEqual(["Sleep", "Work", "felt better after", "Intentions"])
    expect(project(interpret(src), src).nextMoves).toBeNull()
  })

  test("explicit markers still become actions under explicit-only", () => {
    const src = { ...base, text: "I need to book the dentist. I should tidy up.", policies: applyPolicyPatch(DEFAULT_POLICIES, { actionInference: "explicit-only" }) }
    expect(interpret(src).objects.map((o) => o.inferredType)).toEqual(["action", "intention"])
  })

  test("'Be more subtle' leaves notes as prose", () => {
    const cmd = parseCommand("Be more subtle with journal entries.", { currentParagraphs: [0] })!
    const src = { ...base, policies: applyPolicyPatch(DEFAULT_POLICIES, cmd.patch) }
    const interp = interpret(src)
    expect(interp.objects.filter((o) => o.unstructured).map((o) => o.displayText)).toEqual([
      "I slept kind of badly again",
      "I think I stayed up too late scrolling",
      "Work was fine",
      "I kept avoiding the one thing I actually needed to finish",
      "I felt better after walking to get coffee",
    ])
  })

  test("'Only surface unresolved' keeps only unresolved-sounding clauses structured", () => {
    const cmd = parseCommand("Only surface things that sound explicitly unresolved.", { currentParagraphs: [0] })!
    const src = { ...base, policies: applyPolicyPatch(DEFAULT_POLICIES, cmd.patch) }
    const structured = interpret(src).objects.filter((o) => !o.unstructured && !o.parentId).map((o) => o.displayText)
    expect(structured).toEqual(["kept avoiding the one thing I actually needed to finish", "text Sam back", "want to do something different with my weekends"])
  })

  test("unknown commands do not change policy", () => {
    expect(parseCommand("make it purple", { currentParagraphs: [0] })).toBeNull()
  })
})
