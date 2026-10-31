import type { FieldDef, FieldId, RegionRect } from './types'

/**
 * Default regions, measured from the reference 1600x900 game content.
 * Values are tight boxes around the value itself, expressed as fractions of
 * content width/height. The clock box deliberately excludes the date below.
 */
export const FIELDS: FieldDef[] = [
  {
    id: 'clock',
    label: 'Clock',
    shortLabel: 'Clock',
    kind: 'timer',
    maxHours: 23,
    defaultRegion: { x: 0.174, y: 0.024, w: 0.072, h: 0.042 },
  },
  {
    id: 'jump',
    label: 'Jumping in',
    shortLabel: 'Jump',
    kind: 'timer',
    maxHours: 99,
    defaultRegion: { x: 0.756, y: 0.923, w: 0.07, h: 0.037 },
  },
  {
    id: 'system',
    label: 'Current system',
    shortLabel: 'System',
    kind: 'name',
    defaultRegion: { x: 0.18, y: 0.923, w: 0.28, h: 0.037 },
  },
  {
    id: 'waypoint',
    label: 'Waypoint',
    shortLabel: 'Waypoint',
    kind: 'name',
    defaultRegion: { x: 0.49, y: 0.923, w: 0.275, h: 0.037 },
  },
]

export const DEFAULT_REGIONS: Record<FieldId, RegionRect> = Object.fromEntries(
  FIELDS.map((field) => [field.id, { ...field.defaultRegion }]),
) as Record<FieldId, RegionRect>

export function cloneRegions(regions: Record<FieldId, RegionRect>): Record<FieldId, RegionRect> {
  return Object.fromEntries(
    FIELDS.map((field) => [field.id, { ...regions[field.id] }]),
  ) as Record<FieldId, RegionRect>
}
