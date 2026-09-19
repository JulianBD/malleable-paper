import type { Range } from "./types"

export interface Clause {
  range: Range // full clause without connectives
  display: Range // trimmed of leading stubs
  paragraphIndex: number
  sentenceIndex: number
  /** How this clause attaches to the previous one in the same sentence. */
  relation: "start" | "sibling" | "child"
  connective?: string
}

// Connectives that split a sentence into clauses. Order matters: longer first.
const CONNECTIVES: Array<{ re: RegExp; relation: "sibling" | "child" }> = [
  { re: /\s+instead of\s+/gi, relation: "child" },
  { re: /\s+because\s+/gi, relation: "child" },
  { re: /\s+so that\s+/gi, relation: "child" },
  { re: /\s+but\s+/gi, relation: "sibling" },
  { re: /\s+and then\s+/gi, relation: "sibling" },
  { re: /\s+and (?=I\b)/gi, relation: "sibling" },
  { re: /\s+and also\s+/gi, relation: "sibling" },
  { re: /,\s+and\s+/gi, relation: "sibling" },
  { re: /\s+though\b/gi, relation: "sibling" }, // trailing "though" is glue
  { re: /;\s+/g, relation: "sibling" },
]

// Leading stubs that are dropped from the displayed phrase. The words remain in
// the source; the interpreter only chooses a sub-range to display.
const STUBS = [
  /^i also keep thinking (that )?i\s+/i,
  /^i keep thinking (that )?i\s+/i,
  /^i think (that )?i\s+/i,
  /^i think that\s+/i,
  /^i should probably\s+/i,
  /^i should really\s+/i,
  /^i should\s+/i,
  /^i probably should\s+/i,
  /^i really\s+/i,
  /^i just\s+/i,
  /^i also\s+/i,
  /^i'?ve\s+/i,
  /^i'?m\s+/i,
  /^i\s+/i,
  /^also\s+/i,
  /^just\s+/i,
  /^then\s+/i,
  /^that\s+/i,
]

export function splitParagraphs(text: string): Range[] {
  const out: Range[] = []
  let start = 0
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === "\n") {
      if (i > start) out.push({ from: start, to: i })
      start = i + 1
    }
  }
  return out
}

export function splitSentences(text: string, para: Range): Range[] {
  const out: Range[] = []
  let start = para.from
  const slice = text.slice(para.from, para.to)
  const re = /[.!?]+(?=\s|$|[A-Z])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(slice))) {
    const end = para.from + m.index + m[0].length
    out.push(trimRange(text, { from: start, to: end }))
    start = end
  }
  if (start < para.to) out.push(trimRange(text, { from: start, to: para.to }))
  return out.filter((r) => r.to > r.from)
}

export function trimRange(text: string, r: Range): Range {
  let { from, to } = r
  while (from < to && /\s/.test(text[from])) from++
  while (to > from && /\s/.test(text[to - 1])) to--
  return { from, to }
}

function stripTrailingPunct(text: string, r: Range): Range {
  let { from, to } = r
  while (to > from && /[.!,;:]/.test(text[to - 1])) to--
  return { from, to }
}

export function segment(text: string): Clause[] {
  const clauses: Clause[] = []
  splitParagraphs(text).forEach((para, pi) => {
    splitSentences(text, para).forEach((sent, si) => {
      const pieces = splitAtConnectives(text, sent)
      pieces.forEach((p, idx) => {
        const range = stripTrailingPunct(text, trimRange(text, p.range))
        if (range.to <= range.from) return
        const display = trimStubs(text, range)
        // "I felt better after X" → the clause is X, the stub is handled by the classifier as a label.
        clauses.push({
          range,
          display,
          paragraphIndex: pi,
          sentenceIndex: si,
          relation: idx === 0 ? "start" : p.relation,
          connective: p.connective,
        })
      })
    })
  })
  return clauses
}

function splitAtConnectives(text: string, sent: Range): Array<{ range: Range; relation: "start" | "sibling" | "child"; connective?: string }> {
  const slice = text.slice(sent.from, sent.to)
  // Question sentences stay whole: a question is one thought.
  if (/\?\s*$/.test(slice)) return [{ range: sent, relation: "start" }]
  type Hit = { at: number; end: number; relation: "sibling" | "child"; connective: string }
  const hits: Hit[] = []
  for (const c of CONNECTIVES) {
    c.re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = c.re.exec(slice))) {
      if (m.index === 0) continue
      const overlaps = hits.some((h) => m!.index < h.end && m!.index + m![0].length > h.at)
      if (!overlaps) hits.push({ at: m.index, end: m.index + m[0].length, relation: c.relation, connective: m[0].trim() })
    }
  }
  hits.sort((a, b) => a.at - b.at)
  const out: Array<{ range: Range; relation: "start" | "sibling" | "child"; connective?: string }> = []
  let cursor = 0
  let relation: "start" | "sibling" | "child" = "start"
  let connective: string | undefined
  for (const h of hits) {
    out.push({ range: { from: sent.from + cursor, to: sent.from + h.at }, relation, connective })
    cursor = h.end
    relation = h.relation
    connective = h.connective
  }
  out.push({ range: { from: sent.from + cursor, to: sent.to }, relation, connective })
  return out.filter((p) => p.range.to > p.range.from)
}

export function trimStubs(text: string, r: Range): Range {
  let from = r.from
  for (let round = 0; round < 3; round++) {
    const slice = text.slice(from, r.to)
    let matched = false
    for (const s of STUBS) {
      const m = s.exec(slice)
      if (m && m[0].length < slice.length) {
        from += m[0].length
        matched = true
        break
      }
    }
    if (!matched) break
  }
  return { from, to: r.to }
}
