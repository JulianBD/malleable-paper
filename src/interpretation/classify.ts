import type { ObjType } from "../events/reducer"
import type { Policies } from "../automation/policies"
import type { Intent } from "./implications"

export interface Candidate {
  type: ObjType
  score: number
  why: string
}

const EXPLICIT_ACTION = /\b(i need to|i have to|i must|i will|i'll|i'm going to|i've got to|got to|gotta|remind me to)\b/i
const SOFT_ACTION = /\bi (should|ought to)( probably| really| definitely)?\b/i
const IMPERATIVE = /^(i )?(text|call|email|reply|message|send|buy|finish|book|schedule|pay|remind|ask|write|fix|clean|cancel|order|return|follow up|submit|pick up|drop off)\b/i
const WANT = /\b(i want to|i'd like to|i wish i|i hope to|i'm hoping to|i'd love to)\b/i
const STRONG_REFLECTION = /\b(i (?:also |still |just )?keep thinking|i've been thinking|i wonder|i notice|i noticed|i realiz|i feel like|i keep coming back to)\b/i
const HEDGE = /\bi think\b/i
const REFERENCE = /https?:\/\/|\b(article|book|podcast|episode|video|paper|the post|the link|chapter)\b|“[^”]+”|"[^"]+"/i
const FEELING = /\b(slept|sleep|felt|feel|feeling|tired|fine|good|bad|better|worse|happy|sad|anxious|calm|okay|ok|exhausted|stressed|relieved)\b/i
const QUESTION_START = /^(what|why|how|when|where|who|should i|do i|is it|could i|would it|am i|can i)\b/i
export const UNRESOLVED = /\?\s*$|\b(still|haven'?t|hasn'?t|not yet|left .* sitting|avoiding|unfinished|need to|should|waiting|unresolved|keep (avoiding|putting|forgetting)|two days|a week)\b/i

/** Rank type candidates for one clause. Works on the full clause text, not the trimmed display text. */
export function classify(text: string, policies: Policies): Candidate[] {
  const j = policies.journal
  const t = text.trim()
  const c: Candidate[] = []

  if (/\?\s*$/.test(t)) c.push({ type: "question", score: 0.92, why: "ends with ?" })
  else if (QUESTION_START.test(t)) c.push({ type: "question", score: 0.72, why: "question-like opening" })

  const hasWant = WANT.test(t)
  const hasStrongReflection = STRONG_REFLECTION.test(t)

  if (j.actionInference !== "none") {
    if (EXPLICIT_ACTION.test(t)) c.push({ type: "action", score: 0.95, why: `explicit marker “${EXPLICIT_ACTION.exec(t)![0]}”` })
    if (j.actionInference === "liberal") {
      if (SOFT_ACTION.test(t)) c.push({ type: "action", score: 0.8, why: `soft marker “${SOFT_ACTION.exec(t)![0]}”` })
      else if (IMPERATIVE.test(t)) c.push({ type: "action", score: 0.72, why: "imperative verb" })
      if (hasWant && j.intentionsAsCommitments) c.push({ type: "action", score: 0.62, why: "“I want to” read as a soft task (liberal policy)" })
    }
  }
  if (SOFT_ACTION.test(t) && j.actionInference !== "liberal") c.push({ type: "intention", score: 0.66, why: "“should” without a commitment (policy)" })
  if (hasWant) c.push({ type: "intention", score: j.actionInference === "liberal" && j.intentionsAsCommitments ? 0.58 : 0.76, why: `marker “${WANT.exec(t)![0]}”` })

  if (hasStrongReflection) {
    // "I keep thinking I want to…" — the reflection frames a want; the want is the content.
    const framed = hasWant || EXPLICIT_ACTION.test(t)
    c.push({ type: "reflection", score: framed ? 0.6 : 0.82, why: `marker “${STRONG_REFLECTION.exec(t)![0]}”` })
  } else if (HEDGE.test(t)) {
    c.push({ type: "reflection", score: 0.45, why: "hedge “I think”" })
  }

  if (REFERENCE.test(t)) c.push({ type: "reference", score: 0.7, why: "mentions a source" })

  c.push({ type: "note", score: FEELING.test(t) ? 0.7 : 0.5, why: FEELING.test(t) ? "describes a state or feeling" : "default" })

  // Deduplicate by type keeping the highest score, then sort.
  const best = new Map<ObjType, Candidate>()
  for (const cand of c) {
    const prev = best.get(cand.type)
    if (!prev || cand.score > prev.score) best.set(cand.type, cand)
  }
  return [...best.values()].sort((a, b) => b.score - a.score)
}

export const SUGGESTED_ACTIONS: Record<ObjType, string[]> = {
  question: ["think about", "leave open"],
  reflection: ["keep", "connect"],
  intention: ["make concrete", "leave open"],
  action: ["done", "later"],
  reference: ["open", "connect"],
  note: ["keep", "connect"],
}

// Topic keywords → generated group labels. Deliberately tiny.
export const TOPICS: Array<{ id: string; label: string; re: RegExp }> = [
  { id: "topic-sleep", label: "Sleep", re: /\b(slept|sleep|sleeping|asleep|tired|exhausted|awake|insomnia|nap|bed|scrolling|late|dream)\b/i },
  { id: "topic-work", label: "Work", re: /\b(work|meeting|meetings|deadline|project|boss|office|standup|report|finish|task|tasks|client)\b/i },
  { id: "topic-body", label: "Body", re: /\b(gym|run|ran|running|workout|exercise|sick|doctor|headache|walk|walking|yoga)\b/i },
  { id: "topic-money", label: "Money", re: /\b(money|rent|budget|bill|bills|pay|paid|salary|bank)\b/i },
  { id: "topic-home", label: "Home", re: /\b(apartment|house|kitchen|laundry|dishes|clean|groceries)\b/i },
]

export function topicFor(text: string): { id: string; label: string } | null {
  for (const t of TOPICS) if (t.re.test(text)) return { id: t.id, label: t.label }
  return null
}

/** What a clause plausibly wants. Shown as a question, never a statement. */
export function intents(text: string, type: ObjType): Array<{ intent: Intent; score: number; why: string }> {
  const t = text.trim()
  const c: Array<{ intent: Intent; score: number; why: string }> = []
  if (type === "action") c.push({ intent: "resolve", score: 0.8, why: "reads as something to do" })
  if (type === "question") { c.push({ intent: "decide", score: 0.7, why: "asks" }); c.push({ intent: "resolve", score: 0.6, why: "asks" }) }
  if (/(i keep thinking|i want to|i wonder|i'd like to|been thinking)/i.test(t)) { c.push({ intent: "decide", score: 0.5, why: "keeps returning to it" }); c.push({ intent: "vent", score: 0.4, why: "may just be saying it" }) }
  if (/(remember|note to self|don'?t forget)/i.test(t)) c.push({ intent: "remember", score: 0.8, why: "says remember" })
  if (FEELING.test(t)) c.push({ intent: "record", score: 0.7, why: "describes how it went" })
  c.push({ intent: "record", score: 0.5, why: "default for a journal" })
  const best = new Map<Intent, { intent: Intent; score: number; why: string }>()
  for (const x of c) { const p = best.get(x.intent); if (!p || x.score > p.score) best.set(x.intent, x) }
  return [...best.values()].sort((a, b) => b.score - a.score)
}
