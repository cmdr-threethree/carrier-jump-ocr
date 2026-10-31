export type FieldId = 'clock' | 'jump' | 'system' | 'waypoint'

export type FieldKind = 'timer' | 'name'

/** Rectangle normalized to the detected game-content area. */
export interface RegionRect {
  x: number
  y: number
  w: number
  h: number
}

export interface FieldDef {
  id: FieldId
  label: string
  shortLabel: string
  kind: FieldKind
  defaultRegion: RegionRect
  /** Clock must fit in a 24-hour day; countdowns may be longer. */
  maxHours?: number
}

export interface ContentRect {
  x: number
  y: number
  width: number
  height: number
}

export type ResultStatus = 'ok' | 'review'

export interface FieldResult {
  id: FieldId
  raw: string
  value: string
  confidence: number
  status: ResultStatus
  note?: string
  variant: string
  cropUrl: string
}

export interface LoadedImage {
  file: File
  bitmap: ImageBitmap
  url: string
  width: number
  height: number
  contentTop: number
}
