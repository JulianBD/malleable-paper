import { Fragment, useEffect, useRef, useState, type MutableRefObject } from "react"
import type { Interpretation, Label, Range } from "../interpretation/types"
import type { ObjType } from "../events/reducer"
import { OBJ_TYPES } from "../events/reducer"
import type { Block, Projection, Section } from "./project"
import { useFlip, type FlipSeed, type Phase } from "./transition"

export type CorrectionKind = "reject" | "confirm" | "unstructure" | "merge" | "split"

interface Props {
  projection: Projection
  interp: Interpretation
  phase: Phase
  flipSeed: MutableRefObject<FlipSeed | null>
  rootRef: MutableRefObject<HTMLDivElement | null>
  onCorrection: (kind: CorrectionKind, objectId: string, payload: Record<string, unknown>) => void
  onAffordance: (objectId: string | null, action: string) => void
  onWrite: () => void
}

const TYPE_MARK: Record<ObjType, string> = {
  note: "•",
  question: "?",
  reflection: "~",
  intention: "◇",
  action: "□",
  reference: "↗",
}

export function DocumentProjection({ projection, interp, phase, flipSeed, rootRef, onCorrection, onAffordance, onWrite }: Props) {
  useFlip(rootRef, flipSeed, [projection])
  const showReplica = phase === "lift" || phase === "move" || phase === "return"

  return (
    <div ref={rootRef} className={`projection phase-${phase}`}>
      {showReplica && <Replica interp={interp} phase={phase} />}
      <div className="structured column">
        <div className="title-row">
          <h2 className="title generated">{projection.title.text}</h2>
          <button className="ghost tiny generated" onClick={onWrite} title="Return to the paragraph">
            ← write
          </button>
        </div>
        {projection.sections.map((s) => (
          <SectionView key={s.id} section={s} onCorrection={onCorrection} onAffordance={onAffordance} />
        ))}
        {projection.nextMoves && (
          <div className="next-moves">
            <h3 className="heading generated">Possible next moves</h3>
            <div className="moves">
              {projection.nextMoves.map((m) => (
                <button key={m.id} className="move" onClick={() => onAffordance(m.objectId, "focus")}>
                  <span className="authored cap">{m.label.text}</span>
                </button>
              ))}
              <button className="move generated" onClick={() => onAffordance(null, "dismiss_next_moves")}>
                Leave this alone
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SectionView({ section, onCorrection, onAffordance }: { section: Section } & Pick<Props, "onCorrection" | "onAffordance">) {
  return (
    <section className={`sec sec-${section.kind}`} data-section={section.id}>
      {section.label && <Heading label={section.label} sectionId={section.id} />}
      <div className="blocks">
        {section.blocks.map((b) => (
          <BlockView key={b.id} block={b} depth={0} onCorrection={onCorrection} onAffordance={onAffordance} />
        ))}
      </div>
    </section>
  )
}

function Heading({ label, sectionId }: { label: Label; sectionId: string }) {
  if (label.kind === "authored") {
    return (
      <h3 className="heading authored-heading">
        <span className="authored cap" data-flip={`label-${sectionId}`} data-confidence="1">
          {label.text}
        </span>
      </h3>
    )
  }
  return <h3 className="heading generated">{label.text}</h3>
}

function BlockView({ block, depth, onCorrection, onAffordance }: { block: Block; depth: number } & Pick<Props, "onCorrection" | "onAffordance">) {
  const [menu, setMenu] = useState(false)
  const cls = [
    "block",
    `type-${block.type}`,
    `treat-${block.treatment}`,
    block.tentative ? "tentative" : "",
    block.confirmed ? "confirmed" : "",
    block.status ? `status-${block.status}` : "",
    depth ? "child" : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div className={cls} data-block={block.id}>
      <div className="line">
        {block.treatment === "bullet" && <span className="marker generated">{TYPE_MARK[block.type]}</span>}
        <span className="authored" data-flip={block.id} data-confidence={block.confidence}>
          {block.text}
        </span>
        {block.status && <span className="status generated">{block.status}</span>}
        {block.connections.length > 0 && <span className="status generated">connected</span>}
        <button className="more generated" title="Correct this interpretation" onClick={() => setMenu((m) => !m)}>
          ⋯
        </button>
      </div>
      {block.tentative && block.treatment === "bullet" && (
        <div className="clarify generated">
          <span>Is this {/^[aeiou]/.test(block.type) ? "an" : "a"} {block.type}?</span>
          <button onClick={() => onCorrection("confirm", block.id, { type: block.type })}>yes</button>
          <button onClick={() => onCorrection("reject", block.id, { type: block.type })}>no</button>
        </div>
      )}
      {block.affordances.length > 0 && (
        <div className="affordances generated">
          {block.affordances.map((a) => (
            <button key={a.id} onClick={() => onAffordance(block.id, a.id)}>
              {a.label}
            </button>
          ))}
        </div>
      )}
      {menu && <CorrectionMenu block={block} onClose={() => setMenu(false)} onCorrection={onCorrection} />}
      {block.children.length > 0 && (
        <div className="children">
          {block.children.map((c) => (
            <BlockView key={c.id} block={c} depth={depth + 1} onCorrection={onCorrection} onAffordance={onAffordance} />
          ))}
        </div>
      )}
    </div>
  )
}

function CorrectionMenu({ block, onClose, onCorrection }: { block: Block; onClose: () => void; onCorrection: Props["onCorrection"] }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [onClose])
  const fire = (kind: CorrectionKind, payload: Record<string, unknown>) => {
    onCorrection(kind, block.id, payload)
    onClose()
  }
  const words = (offset: number) => block.sourceText.slice(offset).trim().split(/\s+/).slice(0, 3).join(" ")
  return (
    <div ref={ref} className="menu generated">
      {block.treatment === "bullet" && (
        <button onClick={() => fire("reject", { type: block.type })}>Not {/^[aeiou]/.test(block.type) ? "an" : "a"} {block.type}</button>
      )}
      <div className="menu-row">
        <span>Mark as</span>
        {OBJ_TYPES.filter((t) => t !== block.type).map((t) => (
          <button key={t} onClick={() => fire("confirm", { type: t })}>
            {t}
          </button>
        ))}
      </div>
      <button onClick={() => fire("unstructure", { value: block.treatment === "bullet" })}>
        {block.treatment === "bullet" ? "Don’t structure this" : "Structure this"}
      </button>
      {block.hasPrevious && block.previousId && (
        <button onClick={() => fire("merge", { previousId: block.previousId })}>Combine with previous</button>
      )}
      {block.splitCandidates.length > 0 ? (
        <div className="menu-row">
          <span>Split before</span>
          {block.splitCandidates.slice(0, 3).map((at) => (
            <button key={at} onClick={() => fire("split", { at })}>
              “<span className="authored">{words(at)}</span>…”
            </button>
          ))}
        </div>
      ) : (
        <button disabled>Split differently</button>
      )}
      <div className="menu-why">{block.reason}</div>
    </div>
  )
}

/**
 * The paragraph, re-laid in the same column as the editor, with the spans that
 * are about to move left as invisible slots (they keep their space) and the
 * connective "glue" fading out. Only exists during the transition.
 */
function Replica({ interp, phase }: { interp: Interpretation; phase: Phase }) {
  const slots: Array<{ range: Range; id: string }> = [
    ...interp.objects.map((o) => ({ range: o.displayRange, id: o.id })),
    ...interp.groups.flatMap((g) => (g.label?.range ? [{ range: g.label.range, id: `label-${g.id}` }] : [])),
  ].sort((a, b) => a.range.from - b.range.from)

  const paragraphs: Array<Array<{ text: string; slot?: string }>> = [[]]
  let cursor = 0
  const push = (text: string, slot?: string) => {
    const parts = text.split("\n")
    parts.forEach((p, i) => {
      if (i > 0) paragraphs.push([])
      if (p) paragraphs[paragraphs.length - 1].push({ text: p, slot })
    })
  }
  for (const s of slots) {
    if (s.range.from > cursor) push(interp.text.slice(cursor, s.range.from))
    push(interp.text.slice(s.range.from, s.range.to), s.id)
    cursor = Math.max(cursor, s.range.to)
  }
  if (cursor < interp.text.length) push(interp.text.slice(cursor))

  return (
    <div className={`replica column phase-${phase}`} aria-hidden>
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
