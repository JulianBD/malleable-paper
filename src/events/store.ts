import type { EventKind, EventType, LogEvent } from "./types"

const STORAGE_KEY = "malleable-paper.events.v1"
const MAX_EVENTS = 3000

type Listener = () => void

let events: LogEvent[] = load()
const listeners = new Set<Listener>()
let counter = events.length

function load(): LogEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events))
  } catch {
    // storage full or unavailable: the in-memory log still works
  }
}

function emit() {
  for (const l of listeners) l()
}

export function appendEvent(
  eventType: EventType,
  kind: EventKind,
  payload: Record<string, unknown>,
  objectId?: string,
): LogEvent {
  counter += 1
  const ev: LogEvent = {
    id: `ev-${counter.toString(36)}-${Date.now().toString(36)}`,
    ts: Date.now(),
    eventType,
    kind,
    objectId,
    payload,
  }
  // Append-only. We cap the array length for localStorage, dropping the oldest
  // text snapshots only; the latest snapshot is always retained.
  events = events.length >= MAX_EVENTS ? [...events.slice(events.length - MAX_EVENTS + 1), ev] : [...events, ev]
  persist()
  emit()
  return ev
}

export function resetLog() {
  events = []
  counter = 0
  persist()
  emit()
}

export function getEvents(): LogEvent[] {
  return events
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
