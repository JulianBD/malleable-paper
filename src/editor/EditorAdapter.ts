import type { TextChange } from "../events/types"

export interface TextChangeInfo {
  text: string
  changes: TextChange[]
}

/**
 * The only surface the rest of the app uses to talk to the editor.
 * Wordgard implements it (see WordgardEditor.tsx). Positions here are
 * plain-text offsets; the adapter maps them to editor positions.
 */
export interface EditorAdapter {
  getText(): string
  /** First client rect of a plain-text range, in page coordinates, or null. */
  measureRange(from: number, to: number): DOMRect | null
  focus(): void
}
