// Explicit policy state that chat commands mutate. The interpreter reads it.
// Chat never appends "conversation"; it appends policy_change events.

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
  }
}

export const DEFAULT_POLICIES: Policies = {
  journal: {
    actionInference: "liberal",
    subtlety: "normal",
    surface: "all",
    intentionsAsCommitments: true,
    backgroundParagraphs: [],
  },
}

export type PolicyPatch = Partial<Policies["journal"]> | { reset: true }

export function applyPolicyPatch(p: Policies, patch: PolicyPatch): Policies {
  if ("reset" in patch) return DEFAULT_POLICIES
  return { journal: { ...p.journal, ...patch } }
}

export interface ParsedCommand {
  patch: PolicyPatch
  /** Short confirmation for the chat surface (generated language, chat only). */
  reply: string
}

export const SEED_COMMANDS = [
  "Don't turn casual thoughts into tasks.",
  "Be more subtle with journal entries.",
  "Only surface things that sound explicitly unresolved.",
  "Treat this paragraph as background.",
  "Show me things I said I wanted to do, but don't make them commitments.",
  "Reset to defaults.",
]

/** Deterministic command → policy mapping. A future agent would replace this. */
export function parseCommand(input: string, context: { currentParagraphs: number[] }): ParsedCommand | null {
  const t = input.trim().toLowerCase()
  if (!t) return null

  if (/\breset\b|\bdefaults?\b|\bstart over\b/.test(t)) {
    return { patch: { reset: true }, reply: "Policies reset to defaults." }
  }
  if (/(don'?t|do not|stop|never).*(turn|make|convert).*(into|as).*(task|action|todo|commitment)/.test(t) ||
      /unless i (explicitly )?say/.test(t)) {
    return {
      patch: { actionInference: "explicit-only" },
      reply: "journal.actionInference → explicit-only. Only “I need to”, “I have to”, “I will”, “I must” become actions.",
    }
  }
  if (/\bno (tasks|actions)\b|never (infer|create) (tasks|actions)/.test(t)) {
    return { patch: { actionInference: "none" }, reply: "journal.actionInference → none." }
  }
  if (/more (subtle|gentle|quiet|restrained)|less (structure|aggressive)|lighter touch/.test(t)) {
    return {
      patch: { subtlety: "subtle" },
      reply: "journal.subtlety → subtle. Notes stay as prose; only questions, actions and intentions are pulled out.",
    }
  }
  if (/less subtle|more structure|structure more|be bolder/.test(t)) {
    return { patch: { subtlety: "normal" }, reply: "journal.subtlety → normal." }
  }
  if (/only (surface|show|pull out|structure).*(unresolved|open|unfinished|pending)/.test(t)) {
    return {
      patch: { surface: "unresolved-only" },
      reply: "journal.surface → unresolved-only. Only clauses that sound explicitly unresolved are structured.",
    }
  }
  if (/(surface|show|structure) everything|all of it/.test(t)) {
    return { patch: { surface: "all" }, reply: "journal.surface → all." }
  }
  if (/(treat|mark|keep).*(this|that|the).*(paragraph|entry|section).*(background|context)/.test(t)) {
    return {
      patch: { backgroundParagraphs: context.currentParagraphs },
      reply: `journal.backgroundParagraphs → [${context.currentParagraphs.join(", ")}]. Left as prose, muted.`,
    }
  }
  if (/(wanted|want) to do.*(don'?t|not|without).*(commit|task|action)/.test(t) || /not commitments?/.test(t)) {
    return {
      patch: { intentionsAsCommitments: false, actionInference: "explicit-only" },
      reply: "journal.intentionsAsCommitments → false. “I want to” is surfaced as an intention, never as an action.",
    }
  }
  if (/(make|treat).*(wants?|intentions?).*(commitments?|tasks?|actions?)/.test(t)) {
    return { patch: { intentionsAsCommitments: true }, reply: "journal.intentionsAsCommitments → true." }
  }
  return null
}

export function describePolicies(p: Policies): string {
  const j = p.journal
  const parts = [
    `actions: ${j.actionInference}`,
    `subtlety: ${j.subtlety}`,
    `surface: ${j.surface}`,
  ]
  if (!j.intentionsAsCommitments) parts.push("intentions: not commitments")
  if (j.backgroundParagraphs.length) parts.push(`background: ¶${j.backgroundParagraphs.join(",¶")}`)
  return parts.join(" · ")
}
