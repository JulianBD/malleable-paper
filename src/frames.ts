// A frame is a coordinate. Its title is an n-tuple along the bases of linear
// structures. Each basis is a line: a totally ordered set with a successor and
// a predecessor. Moving along one basis is what the margin arrows do.

export type BasisId = "day" | "thread"

export interface Coordinate {
  day: string // ISO date, ordered by calendar
  thread: string // a named line of frames, ordered by first appearance
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

export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + delta))
  return dt.toISOString().slice(0, 10)
}

/** Step one unit along one basis. Threads wrap; days do not. */
export function step(c: Coordinate, basis: BasisId, delta: 1 | -1, threads: string[]): Coordinate {
  if (basis === "day") return { ...c, day: shiftDay(c.day, delta) }
  const list = threads.length ? threads : DEFAULT_THREADS
  const i = Math.max(0, list.indexOf(c.thread))
  return { ...c, thread: list[(i + delta + list.length) % list.length] }
}

export function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })
}

export function relativeDay(day: string): string | null {
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
    if (!seen.includes(t)) seen.push(t)
  }
  return seen
}
