// Policy is the tended set of agent intentions. The command line tends them.
// The proposer (doer) reads them; the interpreter (reader) reads the ones that
// change what counts as an action.

export interface Policies {
  journal: {
    /** liberal: "I should", imperatives and "I want to" can become actions.
     *  explicit-only: only "I need to", "I have to", "I will", "I must".
     *  none: never infer actions. */
    actionInference: "liberal" | "explicit-only" | "none"
    /** normal: pull out topics, notes, reflections, actions.
     *  subtle: only pull out questions, actions and intentions; leave notes as prose. */
    subtlety: "normal" | "subtle"
    /** all: structure everything. unresolved-only: only things that sound explicitly unresolved. */
    surface: "all" | "unresolved-only"
    /** When false, "I want to" is surfaced as an intention but never as a commitment (action). */
    intentionsAsCommitments: boolean
    /** Paragraph indices treated as background: left as prose, muted. */
    backgroundParagraphs: number[]
    /** Agent intentions the human has switched off. */
    heldBack: AgentIntentionId[]
  }
}

export type AgentIntentionId = "surface-next-moves" | "ask-about-tentative" | "offer-connections" | "offer-nesting"

export const AGENT_INTENTIONS: Array<{ id: AgentIntentionId; label: string }> = [
  { id: "surface-next-moves", label: "surface next moves for things that sound like resolve" },
  { id: "ask-about-tentative", label: "ask about a tentative type" },
  { id: "offer-connections", label: "offer a connection when two things are near" },
  { id: "offer-nesting", label: "offer nesting when one thing is dropped under another" },
]

export const DEFAULT_POLICIES: Policies = {
  journal: {
    actionInference: "liberal",
    subtlety: "normal",
    surface: "all",
    intentionsAsCommitments: true,
    backgroundParagraphs: [],
    heldBack: [],
  },
}

export type PolicyPatch = Partial<Policies["journal"]> | { reset: true }

export function applyPolicyPatch(p: Policies, patch: PolicyPatch): Policies {
  if ("reset" in patch) return DEFAULT_POLICIES
  return { journal: { ...p.journal, ...patch } }
}

export function holds(p: Policies, id: AgentIntentionId): boolean {
  return !p.journal.heldBack.includes(id)
}

export interface ParsedCommand {
  patch?: PolicyPatch
  /** A navigation instead of a policy: go to this thread on the current day ("*" = every thread). */
  thread?: string
  /** Record a page: the current query at the current cut. */
  snapshot?: boolean
  /** Navigation along the day basis: "*" = every day, "today" = today. */
  day?: string
  /** A content filter: "type=action mention=sam"; "" clears it. */
  where?: string
  /** Create a widget in the current frame: kind plus tags. */
  widget?: { kind: string; tags: string[] }
  /** Short confirmation for the command line (generated language). */
  reply: string
}

export const SEED_COMMANDS = [
  "Don't turn casual thoughts into tasks.",
  "Be more subtle with journal entries.",
  "Only surface things that sound explicitly unresolved.",
  "Treat this paragraph as background.",
  "Show me things I said I wanted to do, but don't make them commitments.",
  "Stop suggesting next moves.",
  "Reset to defaults.",
  "thread sam",
  "thread *",
  "day *",
  "where type=action mention=sam",
  "widget spreadsheet projects student-debt",
  "where about=student-debt",
  "where off",
  "snapshot",
]

/** Deterministic command → policy mapping. A future agent would replace this. */
export function parseCommand(input: string, context: { currentParagraphs: number[]; policies: Policies }): ParsedCommand | null {
  const t = input.trim().replace(/^\/+\s*/, "").toLowerCase()
  if (!t) return null
  const held = context.policies.journal.heldBack

  if (/^(snapshot|page|render)$/.test(t)) return { snapshot: true, reply: "page rendered" }
  if (/^(?:day|days)\s+(\*|all|every)$/.test(t)) return { day: "*", reply: "day → every day" }
  if (/^(?:day)\s+today$/.test(t)) return { day: "today", reply: "day → today" }
  const wg = /^widget\s+([a-z][a-z0-9-]*)((?:\s+[a-z0-9][a-z0-9-]*)*)$/.exec(t)
  if (wg) { const tags = wg[2].trim().split(/\s+/).filter(Boolean); return { widget: { kind: wg[1], tags }, reply: `widget ${wg[1]} · ${tags.join(" · ")}` } }
  const wh = /^where\s+((?:[a-z]+=[a-z0-9-]+)(?:\s+[a-z]+=[a-z0-9-]+)*)$/.exec(t)
  if (wh) return { where: wh[1].trim(), reply: `where → ${wh[1].trim()}` }
  if (/^where\s+(off|none|clear|\*)$/.test(t)) return { where: "", reply: "where → cleared" }
  if (/^(?:thread|threads)\s+(\*|all|every)$/.test(t)) return { thread: "*", reply: "thread → every thread" }
  const th = /^(?:thread|go to|open)\s+([a-z0-9][a-z0-9 -]{0,24})$/.exec(t)
  if (th) return { thread: th[1].trim(), reply: `thread → ${th[1].trim()}` }
  if (/\breset\b|\bdefaults?\b|\bstart over\b/.test(t)) {
    return { patch: { reset: true }, reply: "policies reset to defaults" }
  }
  if (/(don'?t|do not|stop|never).*(turn|make|convert).*(into|as).*(task|action|todo|commitment)/.test(t) ||
      /unless i (explicitly )?say/.test(t)) {
    return { patch: { actionInference: "explicit-only" }, reply: "actionInference → explicit-only · only “I need to”, “I have to”, “I will”, “I must” become actions" }
  }
  if (/\bno (tasks|actions)\b|never (infer|create) (tasks|actions)/.test(t)) {
    return { patch: { actionInference: "none" }, reply: "actionInference → none" }
  }
  if (/more (subtle|gentle|quiet|restrained)|less (structure|aggressive)|lighter touch/.test(t)) {
    return { patch: { subtlety: "subtle" }, reply: "subtlety → subtle · notes stay as prose" }
  }
  if (/less subtle|more structure|structure more|be bolder/.test(t)) {
    return { patch: { subtlety: "normal" }, reply: "subtlety → normal" }
  }
  if (/only (surface|show|pull out|structure).*(unresolved|open|unfinished|pending)/.test(t)) {
    return { patch: { surface: "unresolved-only" }, reply: "surface → unresolved-only" }
  }
  if (/(surface|show|structure) everything|all of it/.test(t)) {
    return { patch: { surface: "all" }, reply: "surface → all" }
  }
  if (/(treat|mark|keep).*(this|that|the).*(paragraph|entry|section).*(background|context)/.test(t)) {
    return { patch: { backgroundParagraphs: context.currentParagraphs }, reply: `backgroundParagraphs → [${context.currentParagraphs.join(", ")}]` }
  }
  if (/(wanted|want) to do.*(don'?t|not|without).*(commit|task|action)/.test(t) || /not commitments?/.test(t)) {
    return { patch: { intentionsAsCommitments: false, actionInference: "explicit-only" }, reply: "intentionsAsCommitments → false · “I want to” is an intention, never an action" }
  }
  if (/(make|treat).*(wants?|intentions?).*(commitments?|tasks?|actions?)/.test(t)) {
    return { patch: { intentionsAsCommitments: true }, reply: "intentionsAsCommitments → true" }
  }
  if (/(stop|don'?t|no more).*(suggest|propos|offer).*(next moves?|moves)/.test(t)) {
    return { patch: { heldBack: [...new Set([...held, "surface-next-moves" as const])] }, reply: "agent intention held back · surface next moves" }
  }
  if (/(stop|don'?t).*(ask|question).*(tentative|unsure|type)/.test(t)) {
    return { patch: { heldBack: [...new Set([...held, "ask-about-tentative" as const])] }, reply: "agent intention held back · ask about tentative" }
  }
  if (/(stop|don'?t).*(connect|connection|link)/.test(t)) {
    return { patch: { heldBack: [...new Set([...held, "offer-connections" as const])] }, reply: "agent intention held back · offer connections" }
  }
  if (/(suggest|propose|offer).*(next moves?|moves) again|resume.*(moves|suggest)/.test(t)) {
    return { patch: { heldBack: held.filter((h) => h !== "surface-next-moves") }, reply: "agent intention resumed · surface next moves" }
  }
  return null
}

export function describePolicies(p: Policies): string {
  const j = p.journal
  const parts = [`actions ${j.actionInference}`, `subtlety ${j.subtlety}`, `surface ${j.surface}`]
  if (!j.intentionsAsCommitments) parts.push("intentions not commitments")
  if (j.backgroundParagraphs.length) parts.push(`background ¶${j.backgroundParagraphs.join(",¶")}`)
  if (j.heldBack.length) parts.push(`held back: ${j.heldBack.join(", ")}`)
  return parts.join(" · ")
}
