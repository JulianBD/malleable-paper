// The event log is the only authoritative state in the prototype.
// Everything else (implications, presentation, proposals) is derived from it.

export type EventType =
  | "human_event" // authored text, clicks, drags, tends
  | "user_correction" // the human tended an implication or edited segmentation
  | "policy_change" // the human tended an agent intention via the command line
  | "system_inference" // recorded for observability; never authoritative

export type EventKind =
  // data: what happened
  | "text_changed"
  | "block_pinned" // {x, y} pins an object in the frame; {x: null} returns it to flow
  | "action_clicked"
  | "frame_visited"
  | "page_rendered" // a snapshot: {query, cut, hash}; the page is the log prefix before cut, rendered for the query
  // tending an implication (key = subject|claim)
  | "implication_confirmed"
  | "implication_rejected"
  | "implication_deferred"
  // segmentation edits (not claims: they change what the subjects are)
  | "user_unstructured"
  | "user_merged"
  | "user_split"
  // tending an agent intention
  | "automation_policy_changed"
  // instrumentation
  | "implications_ran"
  // legacy kinds kept so old logs still replay
  | "user_rejected_type"
  | "user_confirmed_type"
  | "block_moved"
  | "blocks_connected"
  | "block_grouped"
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
  /** Frame the event belongs to ("x,y"). Absent for global events such as policy. */
  frame?: string
  objectId?: string
  payload: Record<string, unknown>
}

export interface TextChangedPayload {
  /** Full authored text after the change. Snapshot: a CRDT would replace this. */
  text: string
  changes: TextChange[]
  source: "typing" | "demo" | "reset"
}
