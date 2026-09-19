import { useEffect, useRef } from "react"
import type { LogEvent } from "../events/types"
import type { Interpretation } from "../interpretation/types"
import type { Presentation, Block } from "../projection/present"
import type { Proposal } from "../projection/propose"

interface Props {
  events: LogEvent[]
  interp: Interpretation
  presentation: Presentation
  proposals: Proposal[]
  frameId: string
  open: boolean
  onToggle: () => void
}

function short(v: unknown): string {
  const s = JSON.stringify(v)
  return s.length > 120 ? s.slice(0, 117) + "…" : s
}

export function EventInspector({ events, interp, presentation, proposals, frameId, open, onToggle }: Props) {
  const logRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (open && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [events.length, open])

  return (
    <div className={`inspector ${open ? "open" : ""}`}>
      <button className="inspector-bar generated" onClick={onToggle}>
        <span>{open ? "▾" : "▸"} log · {events.length} events · frame {frameId}</span>
        <span className="chain">data → reduce() → interpret() [implications] → present() · propose()</span>
      </button>
      {open && (
        <div className="inspector-body">
          <div className="col" ref={logRef}>
            <h4>data (authoritative)</h4>
            {events.slice(-80).map((e) => (
              <div key={e.id} className={`ev ev-${e.eventType}`}>
                <span className="ev-type">{e.eventType}</span>
                <span className="ev-kind">{e.kind}</span>
                {e.frame && <span className="ev-obj">@{e.frame}</span>}
                {e.objectId && <span className="ev-obj">{e.objectId}</span>}
                <span className="ev-payload">{short(e.payload)}</span>
              </div>
            ))}
          </div>
          <div className="col">
            <h4>implications (running list)</h4>
            {interp.implications.map((i) => (
              <div key={i.key} className={`obj imp-${i.state}`}>
                <span className={`st st-${i.state}`}>{i.state}</span>
                <span className="ev-kind">{i.key}</span>
                <span className="ev-type">{i.confidence.toFixed(2)}</span>
                <span className="ev-payload">{i.producer} · {i.reason} · rests on {i.basis.join(", ")}</span>
              </div>
            ))}
          </div>
          <div className="col">
            <h4>presentation (reader)</h4>
            {presentation.sections.map((s) => (
              <div key={s.id} className="obj">
                <span className="ev-kind">{s.label ? `${s.label.kind}:“${s.label.text}”` : "(no heading)"}</span>
                {s.blocks.map((b) => <BlockRow key={b.id} b={b} depth={1} />)}
              </div>
            ))}
            {presentation.pinnedBlocks.length > 0 && (
              <div className="obj"><span className="ev-kind">pinned</span>{presentation.pinnedBlocks.map((b) => <BlockRow key={b.id} b={b} depth={1} />)}</div>
            )}
            <h4 style={{ marginTop: 10 }}>proposals (doer)</h4>
            {proposals.length === 0 && <div className="obj"><span className="ev-payload">none</span></div>}
            {proposals.map((p) => (
              <div key={p.id} className="obj">
                <span className="ev-kind">{p.shape}</span>
                <span className="ev-obj">{p.intention}</span>
                <span className="ev-payload">{p.shape === "soundboard" ? p.moves.map((m) => `[${m.label.text}]`).join(" ") : p.shape === "toggle" ? `${p.subject} ${p.question}` : p.key}</span>
              </div>
            ))}
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
        {b.id} → {b.treatment === "bullet" ? `${b.type}Block` : "Prose"} · intent {b.intent}{b.tentative ? " · tentative" : ""}{b.confirmed ? " · confirmed" : ""} [{b.affordances.map((a) => a.label).join("] [")}]
      </span>
      {b.children.map((c) => <BlockRow key={c.id} b={c} depth={depth + 1} />)}
    </>
  )
}
