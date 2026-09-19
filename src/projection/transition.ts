// ANIMATE PROVENANCE. FLIP between layouts keyed by object id. The element that
// ends up in the structured layout is transformed back onto the rect where the
// same authored span sat in the paragraph, then released. Confidence changes the
// motion: high confidence moves decisively, low confidence moves slowly.

import { useLayoutEffect, useRef, type MutableRefObject, type RefObject } from "react"

export type Phase = "idle" | "lift" | "move" | "settle" | "label" | "affordance" | "return"

export interface FlipSeed {
  /** Page-coordinate rects keyed by data-flip id, measured from the source paragraph. */
  rects: Map<string, DOMRect>
  releaseDelay: number
  stagger: number
  /** When true the seed overrides only the given ids; other ids keep their last rect. */
  partial?: boolean
}

/** Motion parameters derived from confidence. Lower confidence moves slower and settles softer. */
export function motionFor(confidence: number): { duration: number; easing: string } {
  if (confidence >= 0.8) return { duration: 520, easing: "cubic-bezier(.2,.8,.2,1)" }
  if (confidence >= 0.65) return { duration: 640, easing: "cubic-bezier(.3,.7,.2,1)" }
  return { duration: 820, easing: "cubic-bezier(.4,.5,.3,1)" }
}

// "lift" is set synchronously when the projection mounts; the rest is timed.
export const FORWARD_TIMELINE: Array<[Phase, number]> = [
  ["move", 260],
  ["settle", 1240],
  ["label", 1480],
  ["affordance", 1820],
  ["idle", 2300],
]

export function runTimeline(steps: Array<[Phase, number]>, setPhase: (p: Phase) => void): () => void {
  const timers = steps.map(([phase, at]) => window.setTimeout(() => setPhase(phase), at))
  return () => timers.forEach((t) => window.clearTimeout(t))
}

export function pageRect(el: Element): DOMRect {
  const r = el.getBoundingClientRect()
  return new DOMRect(r.left + window.scrollX, r.top + window.scrollY, r.width, r.height)
}

/**
 * Layout-animation hook. After every commit it compares each [data-flip]
 * element's rect with its previous rect (or a seed measured elsewhere) and
 * plays the inverse transform. New elements get a `flip-enter` class.
 */
export function useFlip(container: RefObject<HTMLElement | null>, seedRef: MutableRefObject<FlipSeed | null>, deps: unknown[]) {
  const last = useRef<Map<string, DOMRect>>(new Map())
  const initial = useRef(true)

  useLayoutEffect(() => {
    const root = container.current
    if (!root) return
    const seed = seedRef.current
    seedRef.current = null
    const prev = seed ? (seed.partial ? new Map([...last.current, ...seed.rects]) : seed.rects) : last.current
    const releaseDelay = seed ? seed.releaseDelay : 0
    const stagger = seed ? seed.stagger : 18
    const isInitial = initial.current
    initial.current = false

    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-flip]"))
    const next = new Map<string, DOMRect>()
    const moves: Array<{ el: HTMLElement; conf: number }> = []
    for (const el of els) {
      const id = el.dataset.flip!
      el.style.transition = "none"
      el.style.transform = ""
      el.classList.remove("flip-moving")
      const now = pageRect(el)
      next.set(id, now)
      const before = prev.get(id)
      if (before) {
        // Align left edges and vertical centres: a text-range rect is glyph-high,
        // an inline-block is line-high, so tops would not coincide.
        const dx = before.left - now.left
        const dy = before.top + before.height / 2 - (now.top + now.height / 2)
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          el.style.transform = `translate(${dx}px, ${dy}px)`
          el.classList.add("flip-moving")
          moves.push({ el, conf: Number(el.dataset.confidence ?? 1) })
        }
      } else if (!isInitial || seed) {
        el.classList.add("flip-enter")
        el.addEventListener("animationend", () => el.classList.remove("flip-enter"), { once: true })
      }
    }
    last.current = next
    if (!moves.length) return

    // Force style resolution so the inverted transform is the starting point.
    void root.offsetHeight
    const timer = window.setTimeout(() => {
      moves.forEach(({ el, conf }, i) => {
        const { duration, easing } = motionFor(conf)
        el.style.transition = `transform ${duration}ms ${easing} ${Math.min(i * stagger, 420)}ms`
        el.style.transform = ""
        const done = () => {
          el.style.transition = ""
          el.classList.remove("flip-moving")
          el.classList.add("flip-settled")
          window.setTimeout(() => el.classList.remove("flip-settled"), 600)
        }
        el.addEventListener("transitionend", done, { once: true })
      })
    }, releaseDelay)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/** Animate current [data-flip] elements onto target rects (used when returning to the paragraph). */
export function flyTo(root: HTMLElement, targets: Map<string, DOMRect>, stagger = 12) {
  const els = Array.from(root.querySelectorAll<HTMLElement>("[data-flip]"))
  els.forEach((el, i) => {
    const target = targets.get(el.dataset.flip!)
    if (!target) {
      el.style.opacity = "0"
      el.style.transition = "opacity 300ms"
      return
    }
    const now = pageRect(el)
    const conf = Number(el.dataset.confidence ?? 1)
    const { duration, easing } = motionFor(conf)
    el.style.transition = `transform ${duration}ms ${easing} ${Math.min(i * stagger, 240)}ms`
    el.style.transform = `translate(${target.left - now.left}px, ${target.top + target.height / 2 - (now.top + now.height / 2)}px)`
    el.classList.add("flip-moving")
  })
}
