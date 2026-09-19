import { useState } from "react"
import { SEED_COMMANDS, describePolicies, type Policies } from "../automation/policies"

export interface ChatMessage {
  role: "you" | "paper"
  text: string
}

interface Props {
  policies: Policies
  messages: ChatMessage[]
  onCommand: (text: string) => void
}

/** Narrow control plane. Not the workspace: it steers the automation. */
export function Collaborator({ policies, messages, onCommand }: Props) {
  const [draft, setDraft] = useState("")
  const [open, setOpen] = useState(true)
  const submit = () => {
    const t = draft.trim()
    if (!t) return
    onCommand(t)
    setDraft("")
  }
  if (!open) {
    return (
      <button className="chat-tab generated" onClick={() => setOpen(true)}>
        steer
      </button>
    )
  }
  return (
    <aside className="chat">
      <div className="chat-head">
        <span className="generated">Steering</span>
        <button className="ghost tiny generated" onClick={() => setOpen(false)}>
          hide
        </button>
      </div>
      <div className="chat-log">
        {messages.length === 0 && <p className="chat-hint generated">Tell the paper how to behave. Commands change policy, not the text.</p>}
        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            {m.text}
          </div>
        ))}
      </div>
      <div className="chat-seeds">
        {SEED_COMMANDS.map((c) => (
          <button key={c} className="seed generated" onClick={() => onCommand(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="chat-input">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Steer the automation…"
        />
        <button onClick={submit} className="generated">
          send
        </button>
      </div>
      <div className="policies generated" title="Current automation policy">
        {describePolicies(policies)}
      </div>
    </aside>
  )
}
