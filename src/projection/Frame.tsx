// One frame: a position on a 2D plane holding flow-placed and pinned objects,
// with margin arrows to the four adjacent frames. Typographic structure and
// spatial placement live together; a drag out of the flow pins an object.

import { Fragment, useEffect, useRef, useState, type MutableRefObject } from "react"
import type { FrameState } from "../events/reducer"
import type { Interpretation, Label, Range } from "../interpretation/types"
import { BlockView, WidgetBlock, type BlockHandlers } from "./Blocks"
import type { Presentation, Section } from "./present"
import type { Proposal } from "./propose"
import { useFlip, type FlipSeed, type Phase } from "./transition"

interface Props {
  presentation: Presentation
  interp: Interpretation
  proposals: Proposal[]
  frame: FrameState
  phase: Phase
  raw: boolean
  flipSeed: MutableRefObject<FlipSeed | null>
  rootRef: MutableRefObject<HTMLDivElement | null>
  handlers: BlockHandlers
  onNavigate: (basis: "day" | "thread", delta: 1 | -1) => void
  onWrite: () => void
  onTend: BlockHandlers["onTend"]
  /** The coordinate, one entry per basis, rendered as the frame's title. */
  title: Array<{ basis: string; label: string; detail: string }>
  /** The query as canonical text; the title edits it. */
  query: string
  onQuery: (text: string) => void
  /** A page cut in the past is immutable: no write, no proposals acted on. */
  frozen?: boolean
}

export function Frame({ presentation, interp, proposals, phase, raw, flipSeed, rootRef, handlers, onNavigate, onWrite, onTend, title, query, onQuery, frozen }: Props) {
  useFlip(rootRef, flipSeed, [presentation])
  const showReplica = phase === "lift" || phase === "move" || phase === "return" || raw
  const soundboard = proposals.find((p) => p.shape === "soundboard")
  const flowRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={rootRef} className={`frame phase-${phase} ${raw ? "raw" : ""} ${frozen ? "frozen" : ""}`}>
      <button className="arrow arrow-up generated" onClick={() => onNavigate("thread", -1)} title="previous thread"><span>↑</span><em>thread</em></button>
      <button className="arrow arrow-left generated" onClick={() => onNavigate("day", -1)} title="the day before"><span>←</span><em>day</em></button>
      <button className="arrow arrow-right generated" onClick={() => onNavigate("day", 1)} title="the day after"><span>→</span><em>day</em></button>
      <button className="arrow arrow-down generated" onClick={() => onNavigate("thread", 1)} title="next thread"><span>↓</span><em>thread</em></button>

      {showReplica && <Replica interp={interp} phase={phase} raw={raw} />}

      <div
        ref={flowRef}
        className="flow column"
        onClick={(e) => { if (e.target === flowRef.current) onWrite() }}
      >
        <div className="title-row">
          <Tuple title={title} query={query} onQuery={onQuery} />
          {frozen ? <span className="generated frozen-tag">page · immutable</span> : <button className="ghost generated" onClick={onWrite}>write</button>}
        </div>
        {presentation.sections.map((s) => <SectionView key={s.id} section={s} h={handlers} />)}
        {presentation.widgets.length > 0 && (
          <section className="sec sec-widgets">
            <h3 className="heading generated">widgets</h3>
            {presentation.widgets.map((w) => <WidgetBlock key={w.id} id={w.id} kind={w.kind} tags={w.tags} keys={handlers.keysFor(w.id)} />)}
          </section>
        )}
        {soundboard && soundboard.shape === "soundboard" && (
          <div className="next-moves">
            <h3 className="heading generated">possible next moves</h3>
            <div className="moves">
              {soundboard.moves.map((m) => (
                <button key={m.objectId} className="move" onClick={() => handlers.onAffordance(m.objectId, "focus")}>
                  <span className="authored cap">{m.label.text}</span>
                </button>
              ))}
              <button className="move generated" onClick={() => soundboard.moves.forEach((m) => onTend(m.key, "deferred", "leave this alone"))}>leave this alone</button>
            </div>
          </div>
        )}
      </div>

      <div className="pinned-layer">
        {presentation.pinnedBlocks.map((b) => <BlockView key={b.id} block={b} depth={0} h={handlers} />)}
        {proposals.filter((p) => p.shape === "connect" || p.shape === "nest").map((p) => {
          const anchor = p.shape === "connect" ? p.a : p.child
          const pos = interp.objects.find((o) => o.id === anchor) && presentation.blockById[anchor]?.pinned
          if (!pos) return null
          return (
            <div key={p.id} className="offer generated" style={{ left: pos.x + 250, top: pos.y + 2 }}>
              {p.shape === "connect" ? (
                <>
                  <button onClick={() => onTend(p.key, "confirmed", "connected")}>connect these?</button>
                  <button onClick={() => onTend(p.key, "rejected", "no")}>no</button>
                </>
              ) : (
                <>
                  <button onClick={() => onTend(p.key, "confirmed", "grouped under")}>group under?</button>
                  <button onClick={() => onTend(p.key, "rejected", "no")}>no</button>
                </>
              )}
            </div>
          )
        })}
        <svg className="links">
          {interp.implications.filter((i) => i.claim.kind === "near" && i.state === "confirmed").map((i) => {
            const a = presentation.blockById[i.subject]?.pinned, b = i.claim.kind === "near" ? presentation.blockById[i.claim.otherId]?.pinned : null
            return a && b ? <line key={i.key} x1={a.x + 8} y1={a.y + 12} x2={b.x + 8} y2={b.y + 12} /> : null
          })}
        </svg>
      </div>
    </div>
  )
}

/**
 * Title tuple shared by Frame and Digest. Click it and the tuple becomes the
 * query as text: `day=2026-09* thread=work* type=action`. Enter applies it;
 * Escape puts the tuple back. The arrows apply one generator each; the text
 * applies any number at once.
 */
export function Tuple({ title, query, onQuery }: { title: Array<{ basis: string; label: string; detail: string }>; query: string; onQuery: (text: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(query)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!editing) setText(query) }, [query, editing])
  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select() } }, [editing])
  if (editing) {
    return (
      <h2 className="title generated tuple editing">
        <span className="query-mark">?</span>
        <input
          ref={inputRef}
          className="title-input"
          value={text}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); setEditing(false); onQuery(text) }
            if (e.key === "Escape") { e.preventDefault(); setEditing(false); setText(query) }
          }}
          onBlur={() => setEditing(false)}
        />
      </h2>
    )
  }
  return (
    <h2 className="title generated tuple" title={`${query} · click to edit the query as text`} onClick={() => setEditing(true)}>
      {title.map((t, i) => (
        <span key={t.basis} className={`coord coord-${t.basis}`} title={t.detail}>{i > 0 && <span className="sep">·</span>}{t.label}</span>
      ))}
    </h2>
  )
}

export function SectionView({ section, h }: { section: Section; h: BlockHandlers }) {
  return (
    <section className={`sec sec-${section.kind}`} data-section={section.id}>
      {section.label && <Heading label={section.label} sectionId={section.id} />}
      <div className="blocks">
        {section.blocks.map((b) => <BlockView key={b.id} block={b} depth={0} h={h} />)}
      </div>
    </section>
  )
}

function Heading({ label, sectionId }: { label: Label; sectionId: string }) {
  if (label.kind === "authored") {
    return <h3 className="heading authored-heading"><span className="authored cap" data-flip={`label-${sectionId}`} data-confidence="1">{label.text}</span></h3>
  }
  return <h3 className="heading generated">{label.text}</h3>
}

/**
 * The paragraph, re-laid in the same column as the editor, with the spans that
 * are about to move left as invisible slots (they keep their space) and the
 * connective "glue" fading. In raw mode the whole paragraph shows.
 */
function Replica({ interp, phase, raw }: { interp: Interpretation; phase: Phase; raw: boolean }) {
  const slots: Array<{ range: Range; id: string }> = [
    ...interp.objects.map((o) => ({ range: o.displayRange, id: o.id })),
    ...interp.groups.flatMap((g) => (g.label?.range ? [{ range: g.label.range, id: `label-${g.id}` }] : [])),
  ].sort((a, b) => a.range.from - b.range.from)

  const paragraphs: Array<Array<{ text: string; slot?: string }>> = [[]]
  const push = (text: string, slot?: string) => {
    text.split("\n").forEach((p, i) => {
      if (i > 0) paragraphs.push([])
      if (p) paragraphs[paragraphs.length - 1].push({ text: p, slot })
    })
  }
  let cursor = 0
  for (const s of slots) {
    if (s.range.from > cursor) push(interp.text.slice(cursor, s.range.from))
    push(interp.text.slice(s.range.from, s.range.to), s.id)
    cursor = Math.max(cursor, s.range.to)
  }
  if (cursor < interp.text.length) push(interp.text.slice(cursor))

  return (
    <div className={`replica column phase-${phase} ${raw ? "raw" : ""}`} aria-hidden>
      {paragraphs.map((p, i) => (
        <p key={i}>
          {p.map((piece, j) => (
            <Fragment key={j}>
              {piece.slot ? <span className="slot" data-slot={piece.slot}>{piece.text}</span> : <span className="glue">{piece.text}</span>}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  )
}
