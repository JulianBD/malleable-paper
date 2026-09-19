// Lightweight spatial view, JSON-Canvas-flavoured. Same object ids as the
// document. Geometry is weak evidence: nearness only *offers* a relation.

import { useEffect, useMemo, useRef, useState } from "react"
import type { SourceState } from "../events/reducer"
import { appendEvent } from "../events/store"
import type { Interpretation } from "../interpretation/types"
import type { Block, Projection } from "./project"

interface Props {
  projection: Projection
  interp: Interpretation
  source: SourceState
  onBack: () => void
}

interface NodeGeom { id: string; x: number; y: number; w: number; h: number }
type Offer = { kind: "connect"; a: string; b: string; x: number; y: number } | { kind: "group"; child: string; parent: string; x: number; y: number }

const NODE_W = 240
const MARK: Record<string, string> = { note: "•", question: "?", reflection: "~", intention: "◇", action: "□", reference: "↗" }

function flatten(blocks: Block[], out: Block[] = []): Block[] {
  for (const b of blocks) { out.push(b); flatten(b.children, out) }
  return out
}

export function SpatialProjection({ projection, interp, source, onBack }: Props) {
  const blocks = useMemo(() => flatten(projection.sections.flatMap((s) => s.blocks)).filter((b) => b.treatment === "bullet"), [projection])
  const sectionOf = useMemo(() => new Map(interp.objects.map((o) => [o.id, o.groupId])), [interp])

  // Default layout: one column per section, unless the log holds a position.
  const defaults = useMemo(() => {
    // Two columns, sections stacked in reading order, heights estimated from text length.
    const colY = [24, 24]
    const pos = new Map<string, { x: number; y: number }>()
    let lastSection: string | undefined
    let col = 0
    for (const b of blocks) {
      const sec = sectionOf.get(b.id)
      if (sec !== lastSection) {
        col = colY[0] <= colY[1] ? 0 : 1
        if (lastSection !== undefined) colY[col] += 18
        lastSection = sec
      }
      const lines = Math.max(1, Math.ceil(b.text.length / 26))
      const h = 30 + lines * 22
      pos.set(b.id, { x: 24 + col * (NODE_W + 48), y: colY[col] })
      colY[col] += h + 12
    }
    return pos
  }, [blocks, sectionOf])

  const [local, setLocal] = useState<Record<string, { x: number; y: number }>>({})
  const [dragging, setDragging] = useState<string | null>(null)
  const [near, setNear] = useState<Set<string>>(new Set())
  const [offer, setOffer] = useState<Offer | null>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const nodeEls = useRef<Map<string, HTMLDivElement>>(new Map())

  const posOf = (id: string) => local[id] ?? source.spatial.positions[id] ?? defaults.get(id) ?? { x: 24, y: 24 }

  const geoms = (): NodeGeom[] =>
    blocks.map((b) => {
      const el = nodeEls.current.get(b.id)
      const p = posOf(b.id)
      return { id: b.id, x: p.x, y: p.y, w: el?.offsetWidth ?? NODE_W, h: el?.offsetHeight ?? 40 }
    })

  const gap = (a: NodeGeom, b: NodeGeom) => {
    const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w))
    const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h))
    return Math.hypot(dx, dy)
  }

  useEffect(() => {
    if (!dragging) return
    const start = posOf(dragging)
    let sx = 0, sy = 0, moved = false
    const onMove = (e: PointerEvent) => {
      if (!sx && !sy) { sx = e.clientX; sy = e.clientY; return }
      moved = true
      const p = { x: Math.max(0, start.x + e.clientX - sx), y: Math.max(0, start.y + e.clientY - sy) }
      setLocal((l) => ({ ...l, [dragging]: p }))
      const gs = geoms()
      const me = { ...gs.find((g) => g.id === dragging)!, ...p }
      setNear(new Set(gs.filter((g) => g.id !== dragging && gap(me, g) < 48).map((g) => g.id)))
    }
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      setDragging(null)
      setNear(new Set())
      if (!moved) return
      const p = posOf(dragging)
      appendEvent("human_event", "block_moved", { x: Math.round(p.x), y: Math.round(p.y), view: "spatial" }, dragging)
      const gs = geoms()
      const me = gs.find((g) => g.id === dragging)!
      // Dropped just under another node and indented → offer grouping.
      const under = gs.find((g) => g.id !== dragging && me.y > g.y + g.h - 4 && me.y - (g.y + g.h) < 36 && me.x - g.x > 12 && me.x - g.x < 80)
      if (under && source.spatial.groupedUnder[dragging] !== under.id) {
        setOffer({ kind: "group", child: dragging, parent: under.id, x: me.x + 20, y: me.y + me.h + 8 })
        return
      }
      const parent = source.spatial.groupedUnder[dragging]
      if (parent) {
        const pg = gs.find((g) => g.id === parent)
        if (pg && gap(me, pg) > 80) appendEvent("human_event", "block_grouped", { parentId: null, reason: "moved away in spatial view" }, dragging)
      }
      const nearest = gs.filter((g) => g.id !== dragging && gap(me, g) < 48).sort((a, b) => gap(me, a) - gap(me, b))[0]
      if (nearest && !source.spatial.connections.some(([a, b]) => (a === dragging && b === nearest.id) || (b === dragging && a === nearest.id))) {
        setOffer({ kind: "connect", a: dragging, b: nearest.id, x: me.x + 20, y: me.y + me.h + 8 })
      } else setOffer(null)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging])

  const canvasHeight = Math.max(560, ...blocks.map((b) => posOf(b.id).y + (nodeEls.current.get(b.id)?.offsetHeight ?? 60) + 40))
  const centers = new Map(blocks.map((b) => { const p = posOf(b.id); const el = nodeEls.current.get(b.id); return [b.id, { x: p.x + (el?.offsetWidth ?? NODE_W) / 2, y: p.y + (el?.offsetHeight ?? 40) / 2 }] }))

  return (
    <div>
      <div className="spatial-head generated">
        <span>Spatial · drag blocks; nearness only offers a relation</span>
        <button className="ghost tiny" onClick={onBack}>← document</button>
      </div>
      <div ref={canvas} className="spatial" style={{ height: canvasHeight }} onPointerDown={() => setOffer(null)}>
        <svg className="link-line">
          {source.spatial.connections.map(([a, b]) => {
            const ca = centers.get(a), cb = centers.get(b)
            return ca && cb ? <line key={a + b} x1={ca.x} y1={ca.y} x2={cb.x} y2={cb.y} /> : null
          })}
          {Object.entries(source.spatial.groupedUnder).map(([c, p]) => {
            const cc = centers.get(c), cp = centers.get(p)
            return cc && cp ? <line key={c + p} x1={cc.x} y1={cc.y} x2={cp.x} y2={cp.y} style={{ strokeDasharray: "1 0", stroke: "var(--open)" }} /> : null
          })}
        </svg>
        {blocks.map((b) => {
          const p = posOf(b.id)
          const cls = ["node", dragging === b.id ? "dragging" : "", source.spatial.positions[b.id] ? "placed" : "", near.has(b.id) ? "near" : "", source.spatial.groupedUnder[b.id] ? "under" : ""].filter(Boolean).join(" ")
          return (
            <div
              key={b.id}
              ref={(el) => { if (el) nodeEls.current.set(b.id, el); else nodeEls.current.delete(b.id) }}
              className={cls}
              style={{ left: p.x, top: p.y, width: NODE_W }}
              onPointerDown={(e) => { e.stopPropagation(); setOffer(null); setDragging(b.id) }}
            >
              <span className="marker generated">{MARK[b.type]}</span>
              <span className="authored">{b.text}</span>
              <span className="node-group generated">{labelFor(projection, sectionOf.get(b.id))}</span>
            </div>
          )
        })}
        {offer && (
          <div className="spatial-offer generated" style={{ left: offer.x, top: offer.y }} onPointerDown={(e) => e.stopPropagation()}>
            {offer.kind === "connect" ? (
              <>
                <button onClick={() => { appendEvent("human_event", "blocks_connected", { a: offer.a, b: offer.b, evidence: "spatial proximity", spatialOnly: true }); setOffer(null) }}>Connect these?</button>
                <button onClick={() => setOffer(null)}>no</button>
              </>
            ) : (
              <>
                <button onClick={() => { appendEvent("human_event", "block_grouped", { parentId: offer.parent, evidence: "dropped under in spatial view" }, offer.child); setOffer(null) }}>Group under?</button>
                <button onClick={() => setOffer(null)}>no</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function labelFor(projection: Projection, sectionId?: string): string {
  const s = projection.sections.find((x) => x.id === sectionId)
  return s?.label ? s.label.text : ""
}
