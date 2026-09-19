import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { WordgardEditor } from "./editor/WordgardEditor"
import type { EditorAdapter, TextChangeInfo } from "./editor/EditorAdapter"
import { appendEvent, getEvents, resetLog, subscribe } from "./events/store"
import { reduce } from "./events/reducer"
import type { ObjType } from "./events/reducer"
import { interpret, summarize } from "./interpretation/interpret"
import { project } from "./projection/project"
import { DocumentProjection, type CorrectionKind } from "./projection/DocumentProjection"
import { SpatialProjection } from "./projection/SpatialProjection"
import { FORWARD_TIMELINE, flyTo, pageRect, runTimeline, type FlipSeed, type Phase } from "./projection/transition"
import { Collaborator, type ChatMessage } from "./chat/Collaborator"
import { EventInspector } from "./dev/EventInspector"
import { describePolicies, parseCommand } from "./automation/policies"
import { splitParagraphs } from "./interpretation/segment"

export const DEMO_TEXT =
  "I slept kind of badly again and I think I stayed up too late scrolling. Work was fine but I kept avoiding the one thing I actually needed to finish. I felt better after walking to get coffee though. I should probably text Sam back because I've left that sitting for two days. I also keep thinking I want to do something different with my weekends instead of losing Saturday mornings."

const IDLE_DELAY = 2000

type Stage = "editing" | "structured"
type View = "document" | "spatial"

export function App() {
  const events = useSyncExternalStore(subscribe, getEvents)
  const source = useMemo(() => reduce(events), [events])
  const interp = useMemo(() => interpret(source), [source])
  const projection = useMemo(() => project(interp, source), [interp, source])

  const [stage, setStage] = useState<Stage>("editing")
  const [phase, setPhase] = useState<Phase>("idle")
  const [view, setView] = useState<View>("document")
  const [listening, setListening] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [docKey, setDocKey] = useState(0)
  const initialText = useRef(source.text)

  const adapterRef = useRef<EditorAdapter | null>(null)
  const stageRef = useRef<Stage>("editing")
  stageRef.current = stage
  const flipSeed = useRef<FlipSeed | null>(null)
  const projectionRoot = useRef<HTMLDivElement | null>(null)
  const idleTimer = useRef<number | null>(null)
  const cancelTimeline = useRef<() => void>(() => {})

  // ---- forward: paragraph → structure -------------------------------------
  const structure = useCallback(() => {
    const adapter = adapterRef.current
    if (!adapter || stageRef.current !== "editing") return
    const src = reduce(getEvents())
    const current = interpret(src)
    if (!current.objects.length) return
    setListening(false)
    appendEvent("system_inference", "interpretation_ran", {
      objects: summarize(current),
      groups: current.groups.map((g) => ({ id: g.id, label: g.label })),
      policies: describePolicies(src.policies),
    })
    const rects = new Map<string, DOMRect>()
    for (const o of current.objects) {
      const r = adapter.measureRange(o.displayRange.from, o.displayRange.to)
      if (r) rects.set(o.id, r)
    }
    for (const g of current.groups) {
      if (g.label?.range) {
        const r = adapter.measureRange(g.label.range.from, g.label.range.to)
        if (r) rects.set(`label-${g.id}`, r)
      }
    }
    flipSeed.current = { rects, releaseDelay: 260, stagger: 55 }
    cancelTimeline.current()
    setPhase("lift") // same commit as the stage change, so FLIP measures the lift layout
    setStage("structured")
    cancelTimeline.current = runTimeline(FORWARD_TIMELINE, setPhase)
  }, [])

  const scheduleStructure = useCallback((delay = IDLE_DELAY) => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current)
    setListening(true)
    idleTimer.current = window.setTimeout(() => {
      idleTimer.current = null
      structure()
    }, delay)
  }, [structure])

  // ---- back: structure → paragraph ---------------------------------------
  const write = useCallback(() => {
    const adapter = adapterRef.current
    const root = projectionRoot.current
    if (stageRef.current !== "structured") return
    cancelTimeline.current()
    setView("document")
    if (adapter && root) {
      const src = reduce(getEvents())
      const current = interpret(src)
      const targets = new Map<string, DOMRect>()
      for (const o of current.objects) {
        const r = adapter.measureRange(o.displayRange.from, o.displayRange.to)
        if (r) targets.set(o.id, r)
      }
      for (const g of current.groups) {
        if (g.label?.range) {
          const r = adapter.measureRange(g.label.range.from, g.label.range.to)
          if (r) targets.set(`label-${g.id}`, r)
        }
      }
      setPhase("return")
      requestAnimationFrame(() => flyTo(root, targets))
      window.setTimeout(() => {
        setStage("editing")
        setPhase("idle")
        adapter.focus()
      }, 720)
    } else {
      setStage("editing")
      setPhase("idle")
    }
  }, [])

  // ---- editor events ------------------------------------------------------
  const onEditorChange = useCallback((info: TextChangeInfo) => {
    appendEvent("human_event", "text_changed", { text: info.text, changes: info.changes, source: "typing" })
    if (stageRef.current === "editing") scheduleStructure()
  }, [scheduleStructure])

  const onEditorReady = useCallback((adapter: EditorAdapter) => {
    adapterRef.current = adapter
    if (adapter.getText().trim()) scheduleStructure(900)
  }, [scheduleStructure])

  const loadDemo = useCallback(() => {
    cancelTimeline.current()
    const prev = reduce(getEvents()).text
    appendEvent("human_event", "text_changed", { text: DEMO_TEXT, changes: [{ from: 0, to: prev.length, inserted: DEMO_TEXT }], source: "demo" })
    initialText.current = DEMO_TEXT
    setStage("editing")
    setPhase("idle")
    setView("document")
    setDocKey((k) => k + 1) // remount editor with the demo text; onReady schedules structuring
  }, [])

  const reset = useCallback(() => {
    cancelTimeline.current()
    if (idleTimer.current) window.clearTimeout(idleTimer.current)
    resetLog()
    initialText.current = ""
    setMessages([])
    setStage("editing")
    setPhase("idle")
    setView("document")
    setListening(false)
    setDocKey((k) => k + 1)
  }, [])

  // ---- corrections & affordances -----------------------------------------
  const onCorrection = useCallback((kind: CorrectionKind, objectId: string, payload: Record<string, unknown>) => {
    const map: Record<CorrectionKind, Parameters<typeof appendEvent>[1]> = {
      reject: "user_rejected_type",
      confirm: "user_confirmed_type",
      unstructure: "user_unstructured",
      merge: "user_merged",
      split: "user_split",
    }
    appendEvent("user_correction", map[kind], payload, objectId)
  }, [])

  const onAffordance = useCallback((objectId: string | null, action: string) => {
    if (action === "make concrete" && objectId) {
      appendEvent("user_correction", "user_confirmed_type", { type: "action" satisfies ObjType, via: "make concrete" }, objectId)
      return
    }
    appendEvent("human_event", "action_clicked", { action }, objectId ?? undefined)
    if (action === "connect") setView("spatial")
  }, [])

  const onCommand = useCallback((text: string) => {
    const src = reduce(getEvents())
    const parsed = parseCommand(text, { currentParagraphs: splitParagraphs(src.text).map((_, i) => i) })
    setMessages((m) => [...m, { role: "you", text }])
    if (!parsed) {
      setMessages((m) => [...m, { role: "paper", text: "I can’t map that to a policy yet. Try one of the seeds below." }])
      return
    }
    const before = describePolicies(src.policies)
    appendEvent("policy_change", "automation_policy_changed", { patch: parsed.patch, utterance: text, before })
    setMessages((m) => [...m, { role: "paper", text: parsed.reply }])
  }, [])

  // Spatial → document round trip happens through events; nothing to do here.
  useEffect(() => () => cancelTimeline.current(), [])

  const stageLabel = stage === "editing" ? (listening ? "reading…" : "writing") : phase === "idle" ? "structured" : phase

  return (
    <div className={`app stage-${stage} view-${view}`}>
      <header className="topbar">
        <div className="brand generated">
          malleable paper <span className="dot" data-on={listening ? "true" : "false"} /> <span className="stage-label">{stageLabel}</span>
        </div>
        <div className="controls generated">
          <div className="seg">
            <button className={stage === "editing" ? "on" : ""} onClick={write} disabled={stage === "editing"}>
              Raw
            </button>
            <button className={stage === "structured" && view === "document" ? "on" : ""} onClick={() => (stage === "editing" ? structure() : setView("document"))}>
              Structured
            </button>
            <button className={view === "spatial" ? "on" : ""} onClick={() => { if (stage === "editing") structure(); setView("spatial") }}>
              Spatial
            </button>
          </div>
          <button className="ghost" onClick={loadDemo}>Load demo</button>
          <button className="ghost" onClick={reset}>Reset</button>
        </div>
      </header>

      <main className="workspace">
        <div className="paper">
          <div className="paper-body">
            <WordgardEditor
              key={docKey}
              docKey={docKey}
              initialText={initialText.current}
              hidden={stage !== "editing"}
              onChange={onEditorChange}
              onReady={onEditorReady}
            />
            {stage === "structured" && view === "document" && (
              <DocumentProjection
                projection={projection}
                interp={interp}
                phase={phase}
                flipSeed={flipSeed}
                rootRef={projectionRoot}
                onCorrection={onCorrection}
                onAffordance={onAffordance}
                onWrite={write}
              />
            )}
            {stage === "structured" && view === "spatial" && (
              <SpatialProjection projection={projection} interp={interp} source={source} onBack={() => setView("document")} />
            )}
          </div>
          {stage === "editing" && !source.text.trim() && (
            <div className="empty-hint generated">
              Type a messy paragraph, or <button className="link" onClick={loadDemo}>load the demo</button>. Pause for two seconds and the paper writes back.
            </div>
          )}
        </div>
        <Collaborator policies={source.policies} messages={messages} onCommand={onCommand} />
      </main>

      <EventInspector events={events} interp={interp} projection={projection} open={inspectorOpen} onToggle={() => setInspectorOpen((o) => !o)} />
    </div>
  )
}

// Used by SpatialProjection for hit testing; kept here to avoid a util module.
export { pageRect }
