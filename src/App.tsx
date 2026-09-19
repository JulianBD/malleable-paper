import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { WordgardEditor } from "./editor/WordgardEditor"
import type { EditorAdapter, TextChangeInfo } from "./editor/EditorAdapter"
import { appendEvent, getEvents, resetLog, subscribe } from "./events/store"
import type { EventKind, EventType } from "./events/types"
import { DEFAULT_FRAME, frameOf, reduce, type ObjType } from "./events/reducer"
import { interpret, summarize } from "./interpretation/interpret"
import { claimKey, type TendState } from "./interpretation/implications"
import { present } from "./projection/present"
import { propose, implicationsFor } from "./projection/propose"
import { Frame } from "./projection/Frame"
import type { BlockHandlers, CorrectionKind } from "./projection/Blocks"
import { FORWARD_TIMELINE, flyTo, pageRect, runTimeline, type FlipSeed, type Phase } from "./projection/transition"
import { CommandLine } from "./chat/CommandLine"
import { EventInspector } from "./dev/EventInspector"
import { describePolicies, parseCommand } from "./automation/policies"
import { splitParagraphs } from "./interpretation/segment"

export const DEMO_TEXT =
  "I slept kind of badly again and I think I stayed up too late scrolling. Work was fine but I kept avoiding the one thing I actually needed to finish. I felt better after walking to get coffee though. I should probably text Sam back because I've left that sitting for two days. I also keep thinking I want to do something different with my weekends instead of losing Saturday mornings."

const IDLE_DELAY = 2000
const KEY_TYPES: Record<string, ObjType> = { a: "action", q: "question", r: "reflection", i: "intention", n: "note", f: "reference" }

type Stage = "editing" | "structured"

export function App() {
  const events = useSyncExternalStore(subscribe, getEvents)
  const [frameId, setFrameId] = useState(DEFAULT_FRAME)
  const source = useMemo(() => reduce(events), [events])
  const frame = useMemo(() => frameOf(source, frameId), [source, frameId])
  const interp = useMemo(() => interpret(frame, source.policies), [frame, source.policies])
  const presentation = useMemo(() => present(interp, frame), [interp, frame])
  const proposals = useMemo(() => propose(interp, frame, source.policies), [interp, frame, source.policies])

  const [stage, setStage] = useState<Stage>("editing")
  const [phase, setPhase] = useState<Phase>("idle")
  const [raw, setRaw] = useState(false)
  const [listening, setListening] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [lastReply, setLastReply] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [cmdFocus, setCmdFocus] = useState(0)
  const [docKey, setDocKey] = useState(0)
  const initialText = useRef(frame.text)

  const adapterRef = useRef<EditorAdapter | null>(null)
  const stageRef = useRef<Stage>("editing")
  stageRef.current = stage
  const frameRef = useRef(frameId)
  frameRef.current = frameId
  const focusedRef = useRef<string | null>(null)
  focusedRef.current = focusedId
  const flipSeed = useRef<FlipSeed | null>(null)
  const frameRoot = useRef<HTMLDivElement | null>(null)
  const idleTimer = useRef<number | null>(null)
  const cancelTimeline = useRef<() => void>(() => {})

  const emit = useCallback((type: EventType, kind: EventKind, payload: Record<string, unknown>, objectId?: string) => {
    appendEvent(type, kind, payload, { objectId, frame: frameRef.current })
  }, [])

  const measureAll = useCallback((adapter: EditorAdapter) => {
    const src = reduce(getEvents())
    const current = interpret(frameOf(src, frameRef.current), src.policies)
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
    return { current, rects, policies: src.policies }
  }, [])

  // ---- forward: paragraph → structure -------------------------------------
  const structure = useCallback(() => {
    const adapter = adapterRef.current
    if (!adapter || stageRef.current !== "editing") return
    const { current, rects, policies } = measureAll(adapter)
    if (!current.objects.length) return
    setListening(false)
    emit("system_inference", "implications_ran", { implications: summarize(current), policies: describePolicies(policies) })
    flipSeed.current = { rects, releaseDelay: 260, stagger: 55 }
    cancelTimeline.current()
    setPhase("lift")
    setStage("structured")
    cancelTimeline.current = runTimeline(FORWARD_TIMELINE, setPhase)
  }, [emit, measureAll])

  const scheduleStructure = useCallback((delay = IDLE_DELAY) => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current)
    setListening(true)
    idleTimer.current = window.setTimeout(() => { idleTimer.current = null; structure() }, delay)
  }, [structure])

  // ---- back: structure → paragraph ---------------------------------------
  const write = useCallback(() => {
    const adapter = adapterRef.current
    const root = frameRoot.current
    if (stageRef.current !== "structured") return
    cancelTimeline.current()
    if (adapter && root) {
      const { rects } = measureAll(adapter)
      setPhase("return")
      requestAnimationFrame(() => flyTo(root, rects))
      window.setTimeout(() => { setStage("editing"); setPhase("idle"); adapter.focus() }, 720)
    } else {
      setStage("editing")
      setPhase("idle")
    }
  }, [measureAll])

  // ---- editor events ------------------------------------------------------
  const onEditorChange = useCallback((info: TextChangeInfo) => {
    emit("human_event", "text_changed", { text: info.text, changes: info.changes, source: "typing" })
    if (stageRef.current === "editing") scheduleStructure()
  }, [emit, scheduleStructure])

  const onEditorReady = useCallback((adapter: EditorAdapter) => {
    adapterRef.current = adapter
    if (adapter.getText().trim()) scheduleStructure(900)
  }, [scheduleStructure])

  const remount = useCallback((text: string) => {
    cancelTimeline.current()
    if (idleTimer.current) window.clearTimeout(idleTimer.current)
    initialText.current = text
    setStage("editing")
    setPhase("idle")
    setListening(false)
    setDocKey((k) => k + 1)
  }, [])

  const loadDemo = useCallback(() => {
    const prev = frameOf(reduce(getEvents()), frameRef.current).text
    emit("human_event", "text_changed", { text: DEMO_TEXT, changes: [{ from: 0, to: prev.length, inserted: DEMO_TEXT }], source: "demo" })
    remount(DEMO_TEXT)
  }, [emit, remount])

  const reset = useCallback(() => {
    resetLog()
    setLastReply(null)
    setFrameId(DEFAULT_FRAME)
    frameRef.current = DEFAULT_FRAME
    remount("")
  }, [remount])

  const navigate = useCallback((dx: number, dy: number) => {
    const [x, y] = frameRef.current.split(",").map(Number)
    const next = `${x + dx},${y + dy}`
    appendEvent("human_event", "frame_visited", { from: frameRef.current }, { frame: next })
    frameRef.current = next
    setFrameId(next)
    remount(frameOf(reduce(getEvents()), next).text)
  }, [remount])

  // ---- tending, corrections, affordances ---------------------------------
  const onTend = useCallback((key: string, state: TendState, reason: string) => {
    const kind: EventKind = state === "confirmed" ? "implication_confirmed" : state === "rejected" ? "implication_rejected" : "implication_deferred"
    emit("user_correction", kind, { key, reason }, key.split("|")[0])
  }, [emit])

  const onCorrection = useCallback((kind: CorrectionKind, objectId: string, payload: Record<string, unknown>) => {
    const map: Record<CorrectionKind, EventKind> = { unstructure: "user_unstructured", merge: "user_merged", split: "user_split" }
    emit("user_correction", map[kind], payload, objectId)
  }, [emit])

  const pin = useCallback((objectId: string, pos: { x: number; y: number } | null) => {
    emit("human_event", "block_pinned", pos ? { x: Math.round(pos.x), y: Math.round(pos.y) } : { x: null, y: null }, objectId)
  }, [emit])

  const onAffordance = useCallback((objectId: string, action: string) => {
    if (action === "make concrete") { onTend(claimKey(objectId, { kind: "type", type: "action" }), "confirmed", "make concrete"); return }
    if (action === "unpin") { pin(objectId, null); return }
    if (action === "connect") {
      // Lift it into the plane, beside the flow, so it can be moved near something.
      const root = frameRoot.current, el = root?.querySelector<HTMLElement>(`[data-block="${objectId}"]`)
      const flow = root?.querySelector<HTMLElement>(".flow")
      if (root && el && flow) {
        const r = pageRect(el), fr = pageRect(root), fl = pageRect(flow)
        flipSeed.current = { rects: new Map([[objectId, pageRect(el.querySelector("[data-flip]")!)]]), releaseDelay: 0, stagger: 0, partial: true }
        pin(objectId, { x: fl.left + fl.width - fr.left + 24, y: r.top - fr.top })
      }
      return
    }
    emit("human_event", "action_clicked", { action }, objectId)
  }, [emit, onTend, pin])

  // ---- lift & drop: flow ↔ pinned ----------------------------------------
  const onLift = useCallback((e: React.PointerEvent, objectId: string) => {
    if (e.button !== 0) return
    const root = frameRoot.current
    const el = root?.querySelector<HTMLElement>(`[data-block="${objectId}"]`)
    const flow = root?.querySelector<HTMLElement>(".flow")
    if (!root || !el || !flow) return
    const sx = e.clientX, sy = e.clientY
    let dragging = false
    let px = sx
    const onMove = (ev: PointerEvent) => {
      px = ev.clientX
      const dx = ev.clientX - sx, dy = ev.clientY - sy
      if (!dragging && Math.hypot(dx, dy) < 6) return
      dragging = true
      el.classList.add("lifting")
      el.style.transform = `translate(${dx}px, ${dy}px)`
    }
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      if (!dragging) return
      const span = el.querySelector<HTMLElement>("[data-flip]")!
      const dropped = pageRect(span)
      const blockRect = pageRect(el)
      const fr = pageRect(root), fl = pageRect(flow)
      el.style.transform = ""
      el.classList.remove("lifting")
      // Where the pointer let go decides: inside the flow column returns it to flow, outside pins it.
      const inFlow = px + window.scrollX < fl.left + fl.width
      flipSeed.current = { rects: new Map([[objectId, dropped]]), releaseDelay: 0, stagger: 0, partial: true }
      if (inFlow) pin(objectId, null)
      else pin(objectId, { x: blockRect.left - fr.left, y: blockRect.top - fr.top })
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }, [pin])

  // ---- keyboard: the fifth input -----------------------------------------
  useEffect(() => {
    const inField = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
    const onKeyDown = (e: KeyboardEvent) => {
      if (inField(e.target)) return
      if (e.key === "/") { e.preventDefault(); setCmdFocus((n) => n + 1); return }
      if (stageRef.current !== "structured") return
      if (e.key === " ") { e.preventDefault(); setRaw(true); return }
      if (e.key === "ArrowLeft") navigate(-1, 0)
      else if (e.key === "ArrowRight") navigate(1, 0)
      else if (e.key === "ArrowUp") navigate(0, -1)
      else if (e.key === "ArrowDown") navigate(0, 1)
      const id = focusedRef.current
      if (!id) return
      const t = KEY_TYPES[e.key.toLowerCase()]
      if (t) onTend(claimKey(id, { kind: "type", type: t }), "confirmed", `key ${e.key}`)
      if (e.key === "Escape") onCorrection("unstructure", id, { value: true })
    }
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === " ") setRaw(false) }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp) }
  }, [navigate, onTend, onCorrection])

  const onCommand = useCallback((text: string) => {
    const src = reduce(getEvents())
    const fr = frameOf(src, frameRef.current)
    const parsed = parseCommand(text, { currentParagraphs: splitParagraphs(fr.text).map((_, i) => i), policies: src.policies })
    if (!parsed) { setLastReply("no policy matches that · try a seed"); return }
    appendEvent("policy_change", "automation_policy_changed", { patch: parsed.patch, utterance: text, before: describePolicies(src.policies) })
    setLastReply(parsed.reply)
  }, [])

  useEffect(() => () => cancelTimeline.current(), [])

  const handlers: BlockHandlers = {
    onTend, onCorrection, onAffordance, onLift, focusedId, setFocusedId,
    proposalsFor: (id) => proposals.filter((p) => (p.shape === "toggle" && p.subject === id)),
    implicationsFor: (id) => implicationsFor(interp, id),
  }

  const stageLabel = stage === "editing" ? (listening ? "reading" : "writing") : phase === "idle" ? (raw ? "raw" : "structured") : phase

  return (
    <div className={`app stage-${stage}`}>
      <header className="topbar generated">
        <span className="brand">malleable paper · {frameId} · <span className="dot" data-on={listening ? "true" : "false"} /> {stageLabel}</span>
        <span className="controls">
          <button className="ghost" onClick={loadDemo}>load demo</button>
          <button className="ghost" onClick={reset}>reset</button>
          <span className="hint">space holds raw · / steers · arrows move frames</span>
        </span>
      </header>

      <main className="plane">
        <div className={`frame-host ${stage}`}>
          <WordgardEditor key={docKey} docKey={docKey} initialText={initialText.current} hidden={stage !== "editing"} onChange={onEditorChange} onReady={onEditorReady} />
          {stage === "structured" && (
            <Frame
              presentation={presentation} interp={interp} proposals={proposals} frame={frame}
              phase={phase} raw={raw} flipSeed={flipSeed} rootRef={frameRoot}
              handlers={handlers} onNavigate={navigate} onWrite={write} onTend={onTend}
            />
          )}
          {stage === "editing" && !frame.text.trim() && (
            <div className="empty-hint generated">
              type a messy paragraph, or <button className="link" onClick={loadDemo}>load the demo</button> · pause two seconds and the paper writes back
            </div>
          )}
        </div>
        <CommandLine policies={source.policies} lastReply={lastReply} onCommand={onCommand} focusSignal={cmdFocus} />
      </main>

      <EventInspector events={events} interp={interp} presentation={presentation} proposals={proposals} frameId={frameId} open={inspectorOpen} onToggle={() => setInspectorOpen((o) => !o)} />
    </div>
  )
}
