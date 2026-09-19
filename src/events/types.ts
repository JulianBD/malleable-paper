// The event log is the only authoritative state in the prototype.
// Everything else (interpretation, projection) is derived from it.

export type EventType =
  | "human_event" // authored text, clicks, spatial moves
  | "user_correction" // the human corrected an inference
  | "policy_change" // the human steered the automation via chat
  | "system_inference" // recorded for observability; never authoritative
  | "schema_proposal" // reserved; unused in this prototype

export type EventKind =
  | "text_changed"
  | "user_rejected_type"
  | "user_confirmed_type"
  | "user_unstructured"
  | "user_merged"
  | "user_split"
  | "action_clicked"
  | "automation_policy_changed"
  | "block_moved"
  | "block_grouped"
  | "blocks_connected"
  | "interpretation_ran"

export interface TextChange {
  from: number
  to: number
  inserted: string
}

export interface LogEvent {
  id: string
  ts: number
  eventType: EventType
  kind: EventKind
  objectId?: string
  payload: Record<string, unknown>
}

export interface TextChangedPayload {
  /** Full authored text after the change. Snapshot: a CRDT would replace this. */
  text: string
  changes: TextChange[]
  source: "typing" | "demo" | "reset"
}
