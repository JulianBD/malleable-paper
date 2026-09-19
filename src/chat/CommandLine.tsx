import { useEffect, useRef, useState } from "react"
import { SEED_COMMANDS, describePolicies, type Policies } from "../automation/policies"

interface Props {
  policies: Policies
  lastReply: string | null
  onCommand: (text: string) => void
  focusSignal: number
}

/** The control plane, folded into one quiet line. It tends the agent's intentions. */
export function CommandLine({ policies, lastReply, onCommand, focusSignal }: Props) {
  const [draft, setDraft] = useState("")
  const [focused, setFocused] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (focusSignal) input.current?.focus() }, [focusSignal])
  const submit = () => {
    const t = draft.trim()
    if (!t) return
    onCommand(t)
    setDraft("")
    input.current?.blur()
  }
  return (
    <div className={`command ${focused ? "focused" : ""}`}>
      <div className="command-line">
        <span className="slash generated">/</span>
        <input
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") input.current?.blur() }}
          placeholder="steer the paper"
          className="generated"
        />
        {lastReply && <span className="reply generated">{lastReply}</span>}
      </div>
      {focused && (
        <div className="seeds">
          {SEED_COMMANDS.map((c) => <button key={c} className="seed generated" onMouseDown={(e) => e.preventDefault()} onClick={() => { onCommand(c); input.current?.blur() }}>{c}</button>)}
        </div>
      )}
      <div className="policies generated" title="the agent's tended intentions">{describePolicies(policies)}</div>
    </div>
  )
}
