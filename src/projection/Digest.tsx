// A frame with an unbound component is a query over several concrete frames.
// The digest renders each matching frame's presentation under its own
// coordinate. It is read-only: writing happens in a bound frame.

import type { MutableRefObject } from "react"
import { WidgetBlock, type BlockHandlers } from "./Blocks"
import { SectionView, Tuple } from "./Frame"
import type { Presentation } from "./present"
import { useFlip, type FlipSeed } from "./transition"

export interface DigestFrame {
  id: string
  label: string // the bound components of this member, e.g. "journal" or "yesterday"
  presentation: Presentation
  handlers: BlockHandlers
}

interface Props {
  frames: DigestFrame[]
  title: Array<{ basis: string; label: string; detail: string }>
  query: string
  onQuery: (text: string) => void
  rootRef: MutableRefObject<HTMLDivElement | null>
  flipSeed: MutableRefObject<FlipSeed | null>
  onNavigate: (basis: "day" | "thread", delta: 1 | -1) => void
  frozen: boolean
}

export function Digest({ frames, title, query, onQuery, rootRef, flipSeed, onNavigate, frozen }: Props) {
  useFlip(rootRef, flipSeed, [frames])
  return (
    <div ref={rootRef} className={`frame phase-idle digest ${frozen ? "frozen" : ""}`}>
      <button className="arrow arrow-up generated" onClick={() => onNavigate("thread", -1)} title="previous thread"><span>↑</span><em>thread</em></button>
      <button className="arrow arrow-left generated" onClick={() => onNavigate("day", -1)} title="the day before"><span>←</span><em>day</em></button>
      <button className="arrow arrow-right generated" onClick={() => onNavigate("day", 1)} title="the day after"><span>→</span><em>day</em></button>
      <button className="arrow arrow-down generated" onClick={() => onNavigate("thread", 1)} title="next thread"><span>↓</span><em>thread</em></button>
      <div className="flow column">
        <div className="title-row">
          <Tuple title={title} query={query} onQuery={onQuery} />
          <span className="generated frozen-tag">{frozen ? "page · immutable" : "digest · read only"}</span>
        </div>
        {frames.length === 0 && <p className="generated quiet">nothing written in this query yet</p>}
        {frames.map((f) => (
          <div key={f.id} className="member" data-member={f.id}>
            <h3 className="heading member-label generated">{f.label}</h3>
            {f.presentation.sections.map((s) => <SectionView key={s.id} section={s} h={f.handlers} />)}
            {f.presentation.widgets.map((w) => <WidgetBlock key={w.id} id={w.id} kind={w.kind} tags={w.tags} keys={f.handlers.keysFor(w.id)} />)}
          </div>
        ))}
      </div>
    </div>
  )
}
