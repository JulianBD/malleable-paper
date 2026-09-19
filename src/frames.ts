// A frame is a coordinate: a point in the cross product of linear bases, one
// of which is time. A coordinate is also a query over the event log: the
// events whose coordinate matches. A component may be unbound ("*"), which
// means every value along that basis, so a frame can be a digest.
//
// A page is a rendering of one query at one moment: (coordinate, cut). The
// cut is an index into the log. A page is immutable because the log prefix
// before the cut never changes.

export type BasisId = "day" | "thread"

export const UNBOUND = "*"

export interface Coordinate {
  day: string // ISO date, ordered by calendar; or "*"
  thread: string // a named line of frames, ordered by first appearance; or "*"
}

export const DEFAULT_THREADS = ["journal", "work", "people"]

export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function frameId(c: Coordinate): string {
  return `day=${c.day}|thread=${c.thread}`
}

export function parseFrameId(id: string): Coordinate {
  const m = /^day=([^|]+)\|thread=(.+)$/.exec(id)
  return m ? { day: m[1], thread: m[2] } : { day: today(), thread: "journal" }
}

export function isBound(c: Coordinate): boolean {
  return c.day !== UNBOUND && c.thread !== UNBOUND
}

/** Does a concrete frame id fall inside a query coordinate? */
export function matches(query: Coordinate, id: string): boolean {
  const c = parseFrameId(id)
  if (!isBound(c)) return false
  return (query.day === UNBOUND || query.day === c.day) && (query.thread === UNBOUND || query.thread === c.thread)
}

export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + delta))
  return dt.toISOString().slice(0, 10)
}

/** Step one unit along one basis. Threads wrap; days do not; an unbound component binds to an end. */
export function step(c: Coordinate, basis: BasisId, delta: 1 | -1, threads: string[]): Coordinate {
  if (basis === "day") return { ...c, day: c.day === UNBOUND ? today() : shiftDay(c.day, delta) }
  const list = threads.length ? threads : DEFAULT_THREADS
  if (c.thread === UNBOUND) return { ...c, thread: delta === 1 ? list[0] : list[list.length - 1] }
  const i = Math.max(0, list.indexOf(c.thread))
  return { ...c, thread: list[(i + delta + list.length) % list.length] }
}

export function formatDay(day: string): string {
  if (day === UNBOUND) return "every day"
  const [y, m, d] = day.split("-").map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })
}

export function relativeDay(day: string): string | null {
  if (day === UNBOUND) return "every day"
  const t = today()
  if (day === t) return "today"
  if (day === shiftDay(t, 1)) return "tomorrow"
  if (day === shiftDay(t, -1)) return "yesterday"
  return null
}

/** Every thread named anywhere in the log, in order of first appearance, defaults first. */
export function threadsFrom(frameIds: string[]): string[] {
  const seen = [...DEFAULT_THREADS]
  for (const id of frameIds) {
    const t = parseFrameId(id).thread
    if (t !== UNBOUND && !seen.includes(t)) seen.push(t)
  }
  return seen
}

/** Order concrete frame ids by thread order, then by day. */
export function orderFrames(ids: string[], threads: string[]): string[] {
  return [...ids].sort((a, b) => {
    const ca = parseFrameId(a), cb = parseFrameId(b)
    const ta = threads.indexOf(ca.thread), tb = threads.indexOf(cb.thread)
    return ta - tb || ca.day.localeCompare(cb.day)
  })
}
