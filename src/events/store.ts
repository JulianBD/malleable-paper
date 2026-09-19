import type { EventKind, EventType, LogEvent } from "./types"

const STORAGE_KEY = "malleable-paper.events.v2"
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

export interface AppendOptions {
  objectId?: string
  frame?: string
}

export function appendEvent(eventType: EventType, kind: EventKind, payload: Record<string, unknown>, opts: AppendOptions = {}): LogEvent {
  counter += 1
  const ev: LogEvent = {
    id: `ev-${counter.toString(36)}-${Date.now().toString(36)}`,
    ts: Date.now(),
    eventType,
    kind,
    frame: opts.frame,
    objectId: opts.objectId,
    payload,
  }
  // Append-only. The array is capped for localStorage by dropping the oldest events.
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
