import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { WordgardEditor } from "./editor/WordgardEditor"
import type { EditorAdapter, TextChangeInfo } from "./editor/EditorAdapter"
import { appendEvent, getEvents, resetLog, subscribe } from "./events/store"
import type { EventKind, EventType } from "./events/types"
import { DEFAULT_FRAME, frameOf, reduce, type ObjType } from "./events/reducer"
import { interpret, summarize } from "./interpretation/interpret"
import { claimKey, type TendState } from "./interpretation/implications"
import type { Interpretation } from "./interpretation/types"
import { present } from "./projection/present"
import { propose, implicationsFor, type Proposal } from "./projection/propose"
import { Frame } from "./projection/Frame"
import { Digest, type DigestFrame } from "./projection/Digest"
import type { BlockHandlers, CorrectionKind } from "./projection/Blocks"
import { FORWARD_TIMELINE, flyTo, pageRect, runTimeline, type FlipSeed, type Phase } from "./projection/transition"
import { CommandLine } from "./chat/CommandLine"
import { EventInspector } from "./dev/EventInspector"
import { describePolicies, parseCommand } from "./automation/policies"
import { splitParagraphs } from "./interpretation/segment"
import { frameId as coordId, parseFrameId, step, threadsFrom, formatDay, formatThread, relativeDay, isBound, isExact, matches, orderFrames, resultHash, today, conjoin, parseQuery, queryText, type BasisId } from "./frames"
import { selectIds, triplesOf, triplesOfWidget } from "./query"
import { filterPresentation } from "./projection/present"

export const DEMO_TEXT =
  "I slept kind of badly again and I think I stayed up too late scrolling. Work was fine but I kept avoiding the one thing I actually needed to finish. I felt better after walking to get coffee though. I should probably text Sam back because I've left that sitting for two days. I also keep thinking I want to do something different with my weekends instead of losing Saturday mornings."

const IDLE_DELAY = 2000
const KEY_TYPES: Record<string, ObjType> = { a: "action", q: "question", r: "reflection", i: "intention", n: "note", f: "reference" }

type Stage = "editing" | "structured"

function hashIds(ids: string[]): string {
  let h = 2166136261
  for (const id of ids) for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(36)
}

export function App() {
  const events = useSyncExternalStore(subscribe, getEvents)
  const [frameId, setFrameId] = useState(DEFAULT_FRAME)
  /** The time cut: a page is the log before this index. null = now. */
  const [cut, setCut] = useState<number | null>(null)
  const visible = useMemo(() => (cut == null ? events : events.slice(0, cut)), [events, cut])
  const source = useMemo(() => reduce(visible), [visible])
  const coord = useMemo(() => parseFrameId(frameId), [frameId])
  const bound = isBound(coord)
  const threads = useMemo(() => threadsFrom(Object.keys(source.frames)), [source])

  // A bound frame: one text, one interpretation.
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
  const eventsRef = useRef(events)
  eventsRef.current = events
  const cutRef = useRef(cut)
  cutRef.current = cut
  const focusedRef = useRef<string | null>(null)
  focusedRef.current = focusedId
  const flipSeed = useRef<FlipSeed | null>(null)
  const frameRoot = useRef<HTMLDivElement | null>(null)
  const idleTimer = useRef<number | null>(null)
  const cancelTimeline = useRef<() => void>(() => {})

  const frozen = cut != null
  const editable = bound && !frozen

  const emitTo = useCallback((fid: string, type: EventType, kind: EventKind, payload: Record<string, unknown>, objectId?: string) => {
    appendEvent(type, kind, payload, { objectId, frame: fid })
  }, [])
  const emit = useCallback((type: EventType, kind: EventKind, payload: Record<string, unknown>, objectId?: string) => {
    emitTo(frameRef.current, type, kind, payload, objectId)
  }, [emitTo])

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
    if (stageRef.current !== "structured" || cutRef.current != null) return
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
    if (!isBound(parseFrameId(frameRef.current))) return
    setCut(null)
    const prev = frameOf(reduce(getEvents()), frameRef.current).text
    emit("human_event", "text_changed", { text: DEMO_TEXT, changes: [{ from: 0, to: prev.length, inserted: DEMO_TEXT }], source: "demo" })
    remount(DEMO_TEXT)
  }, [emit, remount])

  const reset = useCallback(() => {
    resetLog()
    setLastReply(null)
    setCut(null)
    setFrameId(DEFAULT_FRAME)
    frameRef.current = DEFAULT_FRAME
    remount("")
  }, [remount])

  const goTo = useCallback((next: string) => {
    if (next === frameRef.current) return
    appendEvent("human_event", "frame_visited", { from: frameRef.current, coordinate: parseFrameId(next) }, { frame: next })
    frameRef.current = next
    setFrameId(next)
    if (isBound(parseFrameId(next))) remount(frameOf(reduce(getEvents()), next).text)
    else { cancelTimeline.current(); setStage("structured"); setPhase("idle") }
  }, [remount])

  /** Move one unit along one basis of the frame's coordinate. */
  const navigate = useCallback((basis: BasisId, delta: 1 | -1) => {
    const ts = threadsFrom(Object.keys(reduce(getEvents()).frames))
    goTo(coordId(step(parseFrameId(frameRef.current), basis, delta, ts)))
  }, [goTo])

  // A page cut in the past, or a digest, is shown structured with no editor.
  useEffect(() => {
    if ((frozen || !bound) && stage === "editing") { cancelTimeline.current(); setStage("structured"); setPhase("idle") }
  }, [frozen, bound, stage])

  // ---- tending, corrections, affordances (per frame) ---------------------
  const tendIn = useCallback((fid: string, key: string, state: TendState, reason: string) => {
    if (cutRef.current != null) { setLastReply("this is a page · return to now to tend"); return }
    const kind: EventKind = state === "confirmed" ? "implication_confirmed" : state === "rejected" ? "implication_rejected" : "implication_deferred"
    emitTo(fid, "user_correction", kind, { key, reason }, key.split("|")[0])
  }, [emitTo])

  const correctIn = useCallback((fid: string, kind: CorrectionKind, objectId: string, payload: Record<string, unknown>) => {
    if (cutRef.current != null) return
    const map: Record<CorrectionKind, EventKind> = { unstructure: "user_unstructured", merge: "user_merged", split: "user_split" }
    emitTo(fid, "user_correction", map[kind], payload, objectId)
  }, [emitTo])

  const pinIn = useCallback((fid: string, objectId: string, pos: { x: number; y: number } | null) => {
    emitTo(fid, "human_event", "block_pinned", pos ? { x: Math.round(pos.x), y: Math.round(pos.y) } : { x: null, y: null }, objectId)
  }, [emitTo])

  const affordIn = useCallback((fid: string, objectId: string, action: string) => {
    if (cutRef.current != null) return
    if (action === "make concrete") { tendIn(fid, claimKey(objectId, { kind: "type", type: "action" }), "confirmed", "make concrete"); return }
    if (action === "unpin") { pinIn(fid, objectId, null); return }
    if (action === "connect") {
      const root = frameRoot.current, el = root?.querySelector<HTMLElement>(`[data-block="${objectId}"]`)
      const flow = root?.querySelector<HTMLElement>(".flow")
      if (root && el && flow) {
        const r = pageRect(el), fr = pageRect(root), fl = pageRect(flow)
        flipSeed.current = { rects: new Map([[objectId, pageRect(el.querySelector("[data-flip]")!)]]), releaseDelay: 0, stagger: 0, partial: true }
        pinIn(fid, objectId, { x: fl.left + fl.width - fr.left + 24, y: r.top - fr.top })
      }
      return
    }
    emitTo(fid, "human_event", "action_clicked", { action }, objectId)
  }, [emitTo, tendIn, pinIn])

  const onTend = useCallback((key: string, state: TendState, reason: string) => tendIn(frameRef.current, key, state, reason), [tendIn])
  const onCorrection = useCallback((kind: CorrectionKind, objectId: string, payload: Record<string, unknown>) => correctIn(frameRef.current, kind, objectId, payload), [correctIn])
  const onAffordance = useCallback((objectId: string, action: string) => affordIn(frameRef.current, objectId, action), [affordIn])

  // ---- lift & drop: flow ↔ pinned ----------------------------------------
  const onLift = useCallback((e: React.PointerEvent, objectId: string) => {
    if (e.button !== 0 || cutRef.current != null || !isBound(parseFrameId(frameRef.current))) return
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
      const inFlow = px + window.scrollX < fl.left + fl.width
      flipSeed.current = { rects: new Map([[objectId, dropped]]), releaseDelay: 0, stagger: 0, partial: true }
      if (inFlow) pinIn(frameRef.current, objectId, null)
      else pinIn(frameRef.current, objectId, { x: blockRect.left - fr.left, y: blockRect.top - fr.top })
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }, [pinIn])

  // ---- keyboard: the fifth input -----------------------------------------
  useEffect(() => {
    const inField = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
    const onKeyDown = (e: KeyboardEvent) => {
      if (inField(e.target)) return
      if (e.key === "/") { e.preventDefault(); setCmdFocus((n) => n + 1); return }
      // Shift+arrows scrub the time cut: the same query rendered as of an earlier moment.
      if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault()
        const n = eventsRef.current.length
        setCut((c) => {
          if (e.key === "ArrowLeft") return Math.max(1, (c ?? n) - 1)
          if (c == null) return null
          return c + 1 >= n ? null : c + 1
        })
        return
      }
      if (stageRef.current !== "structured") return
      if (e.key === " ") { e.preventDefault(); setRaw(true); return }
      if (e.key === "ArrowLeft") navigate("day", -1)
      else if (e.key === "ArrowRight") navigate("day", 1)
      else if (e.key === "ArrowUp") navigate("thread", -1)
      else if (e.key === "ArrowDown") navigate("thread", 1)
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
    if (parsed.snapshot) {
      const vis = cutRef.current == null ? getEvents() : getEvents().slice(0, cutRef.current)
      appendEvent("human_event", "page_rendered", { query: parseFrameId(frameRef.current), cut: vis.length, hash: hashIds(vis.map((e) => e.id)) }, { frame: frameRef.current })
      setLastReply(`page rendered · ${parseFrameId(frameRef.current).day} · ${parseFrameId(frameRef.current).thread} · as of event ${vis.length}`)
      return
    }
    if (parsed.thread) { setLastReply(parsed.reply); goTo(coordId({ ...parseFrameId(frameRef.current), thread: parsed.thread })); return }
    if (parsed.day) { setLastReply(parsed.reply); goTo(coordId({ ...parseFrameId(frameRef.current), day: parsed.day === "today" ? today() : parsed.day })); return }
    if (parsed.where !== undefined) { setLastReply(parsed.reply); goTo(coordId({ ...parseFrameId(frameRef.current), where: parsed.where || undefined })); return }
    if (parsed.and) { setLastReply(parsed.reply); goTo(coordId(conjoin(parseFrameId(frameRef.current), parsed.and))); return }
    if (parsed.query) { setLastReply(parsed.reply); goTo(queryText(parseQuery(parsed.query))); return }
    if (parsed.widget) {
      if (!isBound(parseFrameId(frameRef.current))) { setLastReply("widgets are created in a bound frame"); return }
      const wid = `w-${hashIds([parsed.widget.kind, ...parsed.widget.tags, String(getEvents().length)])}`
      appendEvent("human_event", "widget_created", { kind: parsed.widget.kind, tags: parsed.widget.tags }, { frame: frameRef.current, objectId: wid })
      setLastReply(parsed.reply)
      if (stageRef.current === "editing") { cancelTimeline.current(); setStage("structured"); setPhase("idle") }
      return
    }
    if (!parsed.patch) return
    appendEvent("policy_change", "automation_policy_changed", { patch: parsed.patch, utterance: text, before: describePolicies(src.policies) })
    setLastReply(parsed.reply)
  }, [goTo])

  /** The title is the query as text; editing it is the same move as applying a generator. */
  const onQuery = useCallback((text: string) => {
    const next = queryText(parseQuery(text))
    if (!next) { setLastReply("a query needs at least one key=value"); return }
    setLastReply(`query → ${next}`)
    goTo(next)
  }, [goTo])

  useEffect(() => () => cancelTimeline.current(), [])

  const handlersFor = useCallback((fid: string, interpF: Interpretation, proposalsF: Proposal[]): BlockHandlers => ({
    onTend: (key, state, reason) => tendIn(fid, key, state, reason),
    onCorrection: (kind, objectId, payload) => correctIn(fid, kind, objectId, payload),
    onAffordance: (objectId, action) => affordIn(fid, objectId, action),
    onLift,
    focusedId,
    setFocusedId,
    proposalsFor: (id) => proposalsF.filter((p) => p.shape === "toggle" && p.subject === id),
    implicationsFor: (id) => implicationsFor(interpF, id),
    keysFor: (id) => {
      const fr = frameOf(reduce(cutRef.current == null ? getEvents() : getEvents().slice(0, cutRef.current)), fid)
      const o = interpF.objects.find((x) => x.id === id)
      const w = fr.widgets[id]
      return (o ? triplesOf(o, interpF, fr) : w ? triplesOfWidget(w, fr) : []).map((t) => ({ p: t.p, o: t.o }))
    },
  }), [tendIn, correctIn, affordIn, onLift, focusedId])

  const handlers = useMemo(() => handlersFor(frameId, interp, proposals), [handlersFor, frameId, interp, proposals])

  // A digest: every concrete frame the query matches, each with its own reading.
  const digest: DigestFrame[] = useMemo(() => {
    if (bound) return []
    const ids = orderFrames(Object.keys(source.frames).filter((id) => matches(coord, id) && source.frames[id].text.trim()), threads)
    return ids.flatMap((id) => {
      const fr = source.frames[id]
      const it = interpret(fr, source.policies)
      const c = parseFrameId(id)
      const parts = [!isExact(coord.day) ? (relativeDay(c.day) ?? formatDay(c.day)) : null, !isExact(coord.thread) ? c.thread : null].filter(Boolean)
      const keep = new Set(selectIds(coord.where, it, fr))
      if (keep.size === 0) return []
      const pres = coord.where ? filterPresentation(present(it, fr), keep) : present(it, fr)
      return [{ id, label: parts.join(" · ") || c.thread, presentation: pres, handlers: handlersFor(id, it, propose(it, fr, source.policies)) }]
    })
  }, [bound, source, coord, threads, handlersFor])

  // The frame's identity is its result set: the ids the query returned, hashed.
  const resultIds = useMemo(() => {
    if (bound) return [...interp.objects.map((o) => o.id), ...Object.keys(frame.widgets)]
    const out: string[] = []
    const walk = (bs: { id: string; children: any[] }[]) => { for (const b of bs) { out.push(b.id); walk(b.children) } }
    for (const f of digest) { for (const sec of f.presentation.sections) walk(sec.blocks); walk(f.presentation.pinnedBlocks); for (const w of f.presentation.widgets) out.push(w.id) }
    return out
  }, [bound, interp, digest, frame.widgets])
  const hash = resultHash(resultIds)
  const prevIds = useRef<string[]>([])
  const [diff, setDiff] = useState<{ added: number; removed: number }>({ added: 0, removed: 0 })
  useEffect(() => {
    const before = new Set(prevIds.current), after = new Set(resultIds)
    const added = resultIds.filter((id) => !before.has(id)).length
    const removed = prevIds.current.filter((id) => !after.has(id)).length
    if (added || removed) setDiff({ added, removed })
    prevIds.current = resultIds
  }, [hash]) // eslint-disable-line react-hooks/exhaustive-deps

  const stageLabel = frozen ? "page" : !bound ? "digest" : stage === "editing" ? (listening ? "reading" : "writing") : phase === "idle" ? (raw ? "raw" : "structured") : phase
  const dayLabel = relativeDay(coord.day) ?? formatDay(coord.day)
  const threadLabel = formatThread(coord.thread)
  const queryString = frameId
  const timeLabel = cut == null ? "now" : `${events.length - cut} events ago`
  const title = [
    { basis: "day", label: dayLabel, detail: `day=${coord.day}` },
    { basis: "thread", label: threadLabel, detail: `thread=${coord.thread}` },
    ...(coord.where ? [{ basis: "where", label: coord.where, detail: "content key filter" }] : []),
    { basis: "time", label: timeLabel, detail: cut == null ? "the log as it is now" : `the log cut at event ${cut} of ${events.length}` },
  ]
  const identity = `#${hash}${diff.added || diff.removed ? ` · +${diff.added} −${diff.removed}` : ""}`

  return (
    <div className={`app stage-${stage}`}>
      <header className="topbar generated">
        <span className="brand">malleable paper · <span className="coord-day">{dayLabel}</span> · <span className="coord-thread">{threadLabel}</span> · <span className="coord-time">{timeLabel}</span> · <span className="identity" title="hash of the ids this query returned, and what changed since the last render">{identity}</span> · <span className="dot" data-on={listening ? "true" : "false"} /> {stageLabel}</span>
        <span className="controls">
          <button className="ghost" onClick={loadDemo}>load demo</button>
          <button className="ghost" onClick={reset}>reset</button>
          <span className="hint">space raw · / steer · arrows frames · ⇧arrows time</span>
        </span>
      </header>

      <main className="plane">
        <div className={`frame-host ${stage}`}>
          {bound && (
            <WordgardEditor key={docKey} docKey={docKey} initialText={initialText.current} hidden={stage !== "editing" || !editable} onChange={onEditorChange} onReady={onEditorReady} />
          )}
          {bound && stage === "structured" && (
            <Frame
              presentation={presentation} interp={interp} proposals={proposals} frame={frame}
              phase={phase} raw={raw} flipSeed={flipSeed} rootRef={frameRoot}
              handlers={handlers} onNavigate={navigate} onWrite={write} onTend={onTend}
              title={title} query={queryString} onQuery={onQuery} frozen={frozen}
            />
          )}
          {!bound && (
            <Digest frames={digest} title={title} query={queryString} onQuery={onQuery} rootRef={frameRoot} flipSeed={flipSeed} onNavigate={navigate} frozen={frozen} />
          )}
          {editable && stage === "editing" && !frame.text.trim() && (
            <div className="empty-hint generated">
              type a messy paragraph, or <button className="link" onClick={loadDemo}>load the demo</button> · pause two seconds and the paper writes back
            </div>
          )}
        </div>
        <CommandLine policies={source.policies} lastReply={lastReply} onCommand={onCommand} focusSignal={cmdFocus} />
      </main>

      <EventInspector events={visible} interp={interp} presentation={presentation} proposals={proposals} frameId={`${dayLabel} · ${threadLabel}${coord.where ? ` · ${coord.where}` : ""} · ${timeLabel} · ${identity}`} open={inspectorOpen} onToggle={() => setInspectorOpen((o) => !o)} />
    </div>
  )
}
