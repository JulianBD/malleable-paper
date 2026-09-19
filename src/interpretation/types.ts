import type { ObjType } from "../events/reducer"

export interface Range {
  from: number
  to: number
}

export interface Label {
  text: string
  /** authored: an exact substring of the source (range given). generated: new words. */
  kind: "authored" | "generated"
  range?: Range
}

export interface InterpretedObject {
  id: string
  /** Full clause, exact substring of the source text. */
  sourceText: string
  sourceRange: Range
  /** The part of the clause the projection shows. Always inside sourceRange. */
  displayRange: Range
  displayText: string
  inferredType: ObjType
  confidence: number
  /** Ranked alternatives, used when a type is rejected. */
  candidates: Array<{ type: ObjType; score: number }>
  explicitTypeOverride?: ObjType
  rejectedTypes: ObjType[]
  groupId: string
  parentId?: string
  paragraphIndex: number
  order: number
  status?: string
  unstructured: boolean
  suggestedActions: string[]
  /** Why the interpreter chose this (for the inspector). */
  reason: string
}

export interface Group {
  id: string
  label: Label | null
  order: number
}

export interface Interpretation {
  text: string
  objects: InterpretedObject[]
  groups: Group[]
  /** Ranges of source text that are not displayed by any object (connectives, stubs). */
  glue: Range[]
}
