import { useEffect, useRef, useState } from "react"
import { OBJ_TYPES, type ObjType } from "../events/reducer"
import { claimKey, type Implication, type TendState } from "../interpretation/implications"
import type { Block } from "./present"
import type { Proposal } from "./propose"

export type CorrectionKind = "unstructure" | "merge" | "split"

export interface BlockHandlers {
  onTend: (key: string, state: TendState, reason: string) => void
  onCorrection: (kind: CorrectionKind, objectId: string, payload: Record<string, unknown>) => void
  onAffordance: (objectId: string, action: string) => void
  onLift: (e: React.PointerEvent, objectId: string) => void
  focusedId: string | null
  setFocusedId: (id: string | null) => void
  proposalsFor: (id: string) => Proposal[]
  implicationsFor: (id: string) => Implication[]
}

export const TYPE_MARK: Record<ObjType, string> = { note: "•", question: "?", reflection: "~", intention: "◇", action: "□", reference: "↗" }

export function BlockView({ block, depth, h }: { block: Block; depth: number; h: BlockHandlers }) {
  const [menu, setMenu] = useState(false)
  const toggle = h.proposalsFor(block.id).find((p) => p.shape === "toggle")
  const cls = [
    "block", `type-${block.type}`, `treat-${block.treatment}`,
    block.tentative ? "tentative" : "", block.confirmed ? "confirmed" : "",
    block.status ? `status-${block.status}` : "", depth ? "child" : "",
    block.pinned ? "pinned" : "", h.focusedId === block.id ? "focused" : "",
  ].filter(Boolean).join(" ")

  return (
    <div
      className={cls}
      data-block={block.id}
      style={block.pinned ? { left: block.pinned.x, top: block.pinned.y } : undefined}
      onPointerEnter={() => h.setFocusedId(block.id)}
      onPointerLeave={() => h.setFocusedId(null)}
    >
      <div className="line" onPointerDown={(e) => h.onLift(e, block.id)}>
        {block.treatment === "bullet" && <span className={`marker mk-${block.type}`} title={`${block.type} · ${block.confidence.toFixed(2)} · ${block.reason}`} aria-label={TYPE_MARK[block.type]} />}
        <span className="authored" data-flip={block.id} data-confidence={block.confidence}>{block.text}</span>
        {block.status && <span className="tag generated">{block.status}</span>}
        {block.connections.length > 0 && <span className="tag generated">connected</span>}
        <button className="more generated" title="tend this interpretation" onPointerDown={(e) => e.stopPropagation()} onClick={() => setMenu((m) => !m)}>⋯</button>
      </div>
      {toggle && toggle.shape === "toggle" && (
        <div className="clarify generated">
          <span>{toggle.question}</span>
          <button onClick={() => h.onTend(toggle.key, "confirmed", "answered yes")}>yes</button>
          <button onClick={() => h.onTend(toggle.key, "rejected", "answered no")}>no</button>
        </div>
      )}
      {block.affordances.length > 0 && (
        <div className="affordances generated">
          {block.affordances.map((a) => (
            <button key={a.id} onClick={() => h.onAffordance(block.id, a.id)}>{a.label}</button>
          ))}
        </div>
      )}
      {menu && <TendMenu block={block} h={h} onClose={() => setMenu(false)} />}
      {block.children.length > 0 && (
        <div className="children">
          {block.children.map((c) => <BlockView key={c.id} block={c} depth={depth + 1} h={h} />)}
        </div>
      )}
    </div>
  )
}

function TendMenu({ block, h, onClose }: { block: Block; h: BlockHandlers; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [onClose])
  const done = (f: () => void) => () => { f(); onClose() }
  const words = (offset: number) => block.sourceText.slice(offset).trim().split(/\s+/).slice(0, 3).join(" ")
  const imps = h.implicationsFor(block.id)
  return (
    <div ref={ref} className="menu generated" onPointerDown={(e) => e.stopPropagation()}>
      {block.treatment === "bullet" && (
        <button onClick={done(() => h.onTend(claimKey(block.id, { kind: "type", type: block.type }), "rejected", "not this type"))}>not {/^[aeiou]/.test(block.type) ? "an" : "a"} {block.type}</button>
      )}
      <div className="menu-row">
        <span>mark as</span>
        {OBJ_TYPES.filter((t) => t !== block.type).map((t) => (
          <button key={t} onClick={done(() => h.onTend(claimKey(block.id, { kind: "type", type: t }), "confirmed", "marked"))}>{t}</button>
        ))}
      </div>
      <button onClick={done(() => h.onCorrection("unstructure", block.id, { value: block.treatment === "bullet" }))}>
        {block.treatment === "bullet" ? "don’t structure this" : "structure this"}
      </button>
      {block.previousId && <button onClick={done(() => h.onCorrection("merge", block.id, { previousId: block.previousId }))}>combine with previous</button>}
      {block.splitCandidates.length > 0 ? (
        <div className="menu-row">
          <span>split before</span>
          {block.splitCandidates.slice(0, 3).map((at) => (
            <button key={at} onClick={done(() => h.onCorrection("split", block.id, { at }))}>“<span className="authored">{words(at)}</span>…”</button>
          ))}
        </div>
      ) : <button disabled>split differently</button>}
      {block.pinned && <button onClick={done(() => h.onAffordance(block.id, "unpin"))}>back into the flow</button>}
      <div className="menu-why">
        {imps.filter((i) => i.state !== "superseded").map((i) => (
          <div key={i.key}><span className={`st st-${i.state}`}>{i.state}</span> {i.key.split("|")[1]} · {i.confidence.toFixed(2)} · {i.reason}</div>
        ))}
      </div>
    </div>
  )
}
