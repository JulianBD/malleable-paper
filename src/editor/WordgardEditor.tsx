import { useEffect, useLayoutEffect, useRef } from "react"
import { Wordgard, placeholder } from "wordgard/editor"
import { blockDoc, paragraph, lineBreak } from "wordgard/schema"
import { history } from "wordgard/history"
import type { Plot, Leaf } from "wordgard/doc"
import type { EditorAdapter, TextChangeInfo } from "./EditorAdapter"

interface Segment {
  offset: number // plain-text offset
  pos: number // editor position
  length: number
}

interface DocMap {
  text: string
  segments: Segment[]
}

/** Walk the document once; produce the plain text and an offset→position table. */
function mapDoc(doc: Plot.Doc): DocMap {
  const segments: Segment[] = []
  let text = ""
  let firstBlock = true
  doc.iterate((node, pos) => {
    if (node.isPlot && (node as Plot).isTextblock) {
      if (!firstBlock) text += "\n"
      firstBlock = false
      return true
    }
    if (node.isLeaf) {
      const leaf = node as Leaf<unknown>
      if (leaf.isText) {
        const s = String(leaf.param)
        segments.push({ offset: text.length, pos, length: s.length })
        text += s
      } else if (leaf.isInline) {
        segments.push({ offset: text.length, pos, length: 1 })
        text += "\n"
      }
      return false
    }
    return true
  })
  return { text, segments }
}

function offsetToPos(map: DocMap, offset: number): number | null {
  for (const s of map.segments) {
    if (offset >= s.offset && offset <= s.offset + s.length) return s.pos + (offset - s.offset)
  }
  return null
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function textToHtml(text: string) {
  const paras = text.split("\n")
  return paras.map((p) => `<p>${escapeHtml(p)}</p>`).join("")
}

interface Props {
  initialText: string
  /** Bumping this remounts the editor with initialText. */
  docKey: number
  hidden: boolean
  onChange: (info: TextChangeInfo) => void
  onReady: (adapter: EditorAdapter) => void
}

export function WordgardEditor({ initialText, docKey, hidden, onChange, onReady }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  const onReadyRef = useRef(onReady)
  onChangeRef.current = onChange
  onReadyRef.current = onReady

  useLayoutEffect(() => {
    const parent = host.current!
    let map: DocMap | null = null
    const wg = Wordgard.create({
      parent,
      doc: textToHtml(initialText),
      config: [
        blockDoc(),
        paragraph(),
        lineBreak(),
        history(),
        placeholder("Write about your day, messily."),
        Wordgard.updateListener.of((update) => {
          if (!update.docChanged) return
          map = mapDoc(update.state.doc)
          const changes: TextChangeInfo["changes"] = []
          update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
            changes.push({ from: fromA, to: toA, inserted: inserted.textContent() })
          })
          onChangeRef.current({ text: map.text, changes })
        }),
      ],
    })
    map = mapDoc(wg.state.doc)

    const adapter: EditorAdapter = {
      getText: () => (map ?? mapDoc(wg.state.doc)).text,
      measureRange(from, to) {
        const m = map ?? (map = mapDoc(wg.state.doc))
        const a = offsetToPos(m, from)
        const b = offsetToPos(m, to)
        if (a == null || b == null) return null
        try {
          wg.flush()
          const start = wg.domAtPos(a, 1)
          const end = wg.domAtPos(b, -1)
          const range = document.createRange()
          range.setStart(start.node, start.offset)
          range.setEnd(end.node, end.offset)
          const rects = range.getClientRects()
          const r = rects.length ? rects[0] : range.getBoundingClientRect()
          return new DOMRect(r.left + window.scrollX, r.top + window.scrollY, r.width, r.height)
        } catch {
          return null
        }
      },
      focus: () => wg.focus(),
    }
    onReadyRef.current(adapter)
    return () => {
      wg.dom.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey])

  useEffect(() => {
    // Wordgard is created once per docKey; visibility is handled by CSS.
  }, [hidden])

  return <div ref={host} className="editor-host column" data-hidden={hidden ? "true" : "false"} />
}
