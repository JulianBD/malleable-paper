// A frame is a query: a conjunction of patterns `key=value` over the triples
// every object carries. Two of the keys, day and thread, are bases with
// monoid structure, so the frame is also a coordinate that the arrows
// traverse monotonically:
//
//   day     (Z, +) acting on calendar dates      generator: ±1 day
//   thread  the free monoid on path segments     generator: next/prev in order
//   where   patterns under conjunction (∧)       generator: ∧ one more pattern
//
// Each generator is monotone: a day step moves forward or back along the
// calendar, a thread step moves along the sorted paths so a parent precedes
// its children, and ∧ narrows the result set (a subset every time). A value
// ending in `*` is a prefix, which is how a monoid element names the set
// beneath it: `day=2026-09*` is the month, `thread=work*` is the subtree.
//
// The query is text. Editing the text and applying a generator are two
// spellings of the same move; the canonical text is the frame's id, so two
// paths that reach the same query reach the same frame (associativity).
//
// A page is a rendering of one query at one moment: (query, cut). The cut is
// an index into the log; a page is immutable because the log prefix before
// the cut never changes.

export type BasisId = "day" | "thread"

export const UNBOUND = "*"

export interface Pattern { key: string; value: string }
export type Query = Pattern[]

/** A view of a query along its two bases, plus the remaining patterns as text. */
export interface Coordinate {
  day: string // ISO date, "*", or a prefix like "2026-09*"
  thread: string // a path like "work/project", "*", or a prefix like "work*"
  /** Every other pattern, canonical text, e.g. "mention=sam type=action". Empty = none. */
  where?: string
}

export const DEFAULT_THREADS = ["journal", "work", "people"]

export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + delta))
  return dt.toISOString().slice(0, 10)
}

export function normTag(v: string): string {
  return v.trim().toLowerCase().replace(/[\s_]+/g, "-")
}

/** Relative day words become dates, so "day=yesterday" and "day=2026-09-18" are one query. */
function normDay(v: string): string {
  if (v === "today") return today()
  if (v === "tomorrow") return shiftDay(today(), 1)
  if (v === "yesterday") return shiftDay(today(), -1)
  const rel = /^today([+-]\d+)$/.exec(v)
  if (rel) return shiftDay(today(), Number(rel[1]))
  return v
}

const KEY_ORDER = ["day", "thread"]
function keyRank(k: string): number { const i = KEY_ORDER.indexOf(k); return i < 0 ? KEY_ORDER.length : i }

/** Parse query text: whitespace-separated `key=value` tokens. Unknown tokens are ignored. */
export function parseQuery(text: string | undefined): Query {
  if (!text) return []
  const seen = new Set<string>()
  const out: Query = []
  for (const part of text.trim().toLowerCase().split(/\s+/)) {
    const m = /^([a-z]+)[=:](.+)$/.exec(part)
    if (!m) continue
    const key = m[1]
    let value = key === "day" ? normDay(m[2]) : key === "thread" ? m[2].replace(/^\/+|\/+$/g, "") : m[2]
    if (key !== "text") value = value.replace(/_/g, "-")
    const k = `${key}=${value}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ key, value })
  }
  return canonical(out)
}

/** Canonical order: day, thread, then every other key alphabetically. Equal queries print equal. */
export function canonical(q: Query): Query {
  return [...q].sort((a, b) => keyRank(a.key) - keyRank(b.key) || a.key.localeCompare(b.key) || a.value.localeCompare(b.value))
}

export function queryText(q: Query): string {
  return canonical(q).map((p) => `${p.key}=${p.value}`).join(" ")
}

/** The value a query gives a basis, "*" when the basis is absent. */
export function basisValue(q: Query, key: BasisId): string {
  const p = q.find((x) => x.key === key)
  return p ? p.value : UNBOUND
}

export function toCoordinate(q: Query): Coordinate {
  const rest = q.filter((p) => p.key !== "day" && p.key !== "thread")
  return { day: basisValue(q, "day"), thread: basisValue(q, "thread"), where: rest.length ? queryText(rest) : undefined }
}

export function fromCoordinate(c: Coordinate): Query {
  const q: Query = []
  if (c.day !== UNBOUND) q.push({ key: "day", value: c.day })
  if (c.thread !== UNBOUND) q.push({ key: "thread", value: c.thread })
  return canonical([...q, ...parseQuery(c.where)])
}

/** The frame id is the canonical query text. */
export function frameId(c: Coordinate): string {
  return queryText(fromCoordinate(c))
}

export function parseFrameId(id: string): Coordinate {
  const c = toCoordinate(parseQuery(id))
  return id.includes("=") ? c : { day: today(), thread: "journal" }
}

/** Is a pattern value exact (one point), a prefix (a set beneath a point), or unbound (everything)? */
export function isExact(v: string): boolean { return v !== UNBOUND && !v.endsWith("*") }

/** A concrete frame: both bases exact and no other pattern. Only these hold text. */
export function isBound(c: Coordinate): boolean {
  return isExact(c.day) && isExact(c.thread) && !c.where
}

/** The concrete frame a query writes into, if it has one. */
export function concrete(c: Coordinate): Coordinate {
  return { day: c.day, thread: c.thread }
}

/** Does a value satisfy a pattern value? `*` is anything, `x*` is a prefix, else equality. */
export function matchValue(pattern: string, value: string): boolean {
  if (pattern === UNBOUND) return true
  if (pattern.endsWith("*")) return value.startsWith(pattern.slice(0, -1))
  return normTag(value) === normTag(pattern)
}

/** Does a concrete frame id fall inside a query along both bases? */
export function matches(query: Coordinate, id: string): boolean {
  const c = parseFrameId(id)
  if (!isBound(c)) return false
  return matchValue(query.day, c.day) && matchValue(query.thread, c.thread)
}

/** One generator of one basis: a monotone step. Days shift; threads move along the sorted paths and wrap; an unbound basis binds to an end. */
export function step(c: Coordinate, basis: BasisId, delta: 1 | -1, threads: string[]): Coordinate {
  if (basis === "day") return { ...c, day: isExact(c.day) ? shiftDay(c.day, delta) : today() }
  const list = threads.length ? threads : [...DEFAULT_THREADS].sort()
  if (!isExact(c.thread)) return { ...c, thread: delta === 1 ? list[0] : list[list.length - 1] }
  const i = Math.max(0, list.indexOf(c.thread))
  return { ...c, thread: list[(i + delta + list.length) % list.length] }
}

/** The where generator: conjoin one more pattern. Never widens the result set. */
export function conjoin(c: Coordinate, pattern: string): Coordinate {
  const q = fromCoordinate(c)
  for (const p of parseQuery(pattern)) if (!q.some((x) => x.key === p.key && x.value === p.value)) q.push(p)
  return toCoordinate(canonical(q))
}

export function formatDay(day: string): string {
  if (day === UNBOUND) return "every day"
  if (day.endsWith("*")) return `${day.slice(0, -1).replace(/-$/, "")}…`
  const [y, m, d] = day.split("-").map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })
}

export function relativeDay(day: string): string | null {
  if (day === UNBOUND) return "every day"
  if (day.endsWith("*")) {
    const p = day.slice(0, -1).replace(/-$/, "")
    if (/^\d{4}$/.test(p)) return `year ${p}`
    if (/^\d{4}-\d{2}$/.test(p)) { const [y, m] = p.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" }).toLowerCase() }
    return `${p}…`
  }
  const t = today()
  if (day === t) return "today"
  if (day === shiftDay(t, 1)) return "tomorrow"
  if (day === shiftDay(t, -1)) return "yesterday"
  return null
}

export function formatThread(thread: string): string {
  if (thread === UNBOUND) return "every thread"
  if (thread.endsWith("*")) return `${thread.slice(0, -1).replace(/\/$/, "")}/…`
  return thread
}

/** Every thread path named anywhere in the log plus the defaults, sorted so a parent precedes its children. */
export function threadsFrom(frameIds: string[]): string[] {
  const seen = new Set(DEFAULT_THREADS)
  for (const id of frameIds) {
    const t = parseFrameId(id).thread
    if (isExact(t)) seen.add(t)
  }
  return [...seen].sort()
}

/** Order concrete frame ids by thread order, then by day. */
export function orderFrames(ids: string[], threads: string[]): string[] {
  return [...ids].sort((a, b) => {
    const ca = parseFrameId(a), cb = parseFrameId(b)
    const ta = threads.indexOf(ca.thread), tb = threads.indexOf(cb.thread)
    return ta - tb || ca.day.localeCompare(cb.day)
  })
}

/** The content patterns of a where clause (every key but the bases). */
export function parseWhere(where: string | undefined): Pattern[] {
  return parseQuery(where).filter((p) => p.key !== "day" && p.key !== "thread")
}

/** Result-set identity: a hash of the ordered object ids a query returned. */
export function resultHash(ids: string[]): string {
  let h = 2166136261
  for (const id of ids) for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(36).padStart(7, "0").slice(0, 6)
}
