import { useEffect, useRef } from "react"
import type { LogEvent } from "../events/types"
import type { Interpretation } from "../interpretation/types"
import type { Projection, Block } from "../projection/project"

interface Props {
  events: LogEvent[]
  interp: Interpretation
  projection: Projection
  open: boolean
  onToggle: () => void
}

function short(v: unknown): string {
  const s = JSON.stringify(v)
  return s.length > 140 ? s.slice(0, 137) + "…" : s
}

export function EventInspector({ events, interp, projection, open, onToggle }: Props) {
  const logRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [events.length, open])

  return (
    <div className={`inspector ${open ? "open" : ""}`}>
      <button className="inspector-bar generated" onClick={onToggle}>
        <span>{open ? "▾" : "▸"} Event log · {events.length} events</span>
        <span className="chain">events → reduce() → interpret() → project()</span>
      </button>
      {open && (
        <div className="inspector-body">
          <div className="col" ref={logRef}>
            <h4>Events (authoritative)</h4>
            {events.slice(-80).map((e) => (
              <div key={e.id} className={`ev ev-${e.eventType}`}>
                <span className="ev-type">{e.eventType}</span>
                <span className="ev-kind">{e.kind}</span>
                {e.objectId && <span className="ev-obj">{e.objectId}</span>}
                <span className="ev-payload">{short(e.payload)}</span>
              </div>
            ))}
          </div>
          <div className="col">
            <h4>Interpretation (derived)</h4>
            {interp.objects.map((o) => (
              <div key={o.id} className="obj">
                <span className="ev-obj">{o.id}</span>
                <span className="ev-kind">{o.inferredType}</span>
                <span className="ev-type">{o.confidence.toFixed(2)}</span>
                <span className="ev-payload">
                  group={o.groupId}
                  {o.parentId ? ` parent=${o.parentId}` : ""}
                  {o.explicitTypeOverride ? ` override=${o.explicitTypeOverride}` : ""}
                  {o.rejectedTypes.length ? ` rejected=[${o.rejectedTypes.join(",")}]` : ""}
                  {o.unstructured ? " unstructured" : ""}
                  {o.status ? ` status=${o.status}` : ""}
                </span>
                <span className="ev-payload">
                  [{o.sourceRange.from}–{o.sourceRange.to}] “{o.displayText}” — {o.reason}
                </span>
              </div>
            ))}
          </div>
          <div className="col">
            <h4>Projection (derived)</h4>
            {projection.sections.map((s) => (
              <div key={s.id} className="obj">
                <span className="ev-kind">
                  section {s.id} {s.label ? `${s.label.kind}:“${s.label.text}”` : "(no heading)"}
                </span>
                {s.blocks.map((b) => (
                  <BlockRow key={b.id} b={b} depth={1} />
                ))}
              </div>
            ))}
            {projection.nextMoves && (
              <div className="obj">
                <span className="ev-kind">next moves</span>
                <span className="ev-payload">{projection.nextMoves.map((m) => `[${m.label.text}]`).join(" ")} [Leave this alone]</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function BlockRow({ b, depth }: { b: Block; depth: number }) {
  return (
    <>
      <span className="ev-payload" style={{ paddingLeft: depth * 12 }}>
        {b.id} → {b.treatment === "bullet" ? `${b.type}Block` : "Prose"}
        {b.tentative ? " (tentative)" : ""}
        {b.confirmed ? " (confirmed)" : ""} [{b.affordances.map((a) => a.label).join("] [")}]
      </span>
      {b.children.map((c) => (
        <BlockRow key={c.id} b={c} depth={depth + 1} />
      ))}
    </>
  )
}
