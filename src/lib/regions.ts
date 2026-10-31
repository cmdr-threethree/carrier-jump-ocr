import { DEFAULT_REGIONS, FIELDS } from './constants'
import type { FieldId, RegionRect } from './types'

const STORAGE_KEY = 'game-screenshot-ocr:regions:v1'

type RegionMap = Record<FieldId, RegionRect>
type StoredProfiles = Record<string, RegionMap>

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function sanitizeRegion(region: unknown, fallback: RegionRect): RegionRect {
  if (!region || typeof region !== 'object') return { ...fallback }
  const candidate = region as Partial<RegionRect>
  if (
    !isFiniteNumber(candidate.x) ||
    !isFiniteNumber(candidate.y) ||
    !isFiniteNumber(candidate.w) ||
    !isFiniteNumber(candidate.h)
  ) {
    return { ...fallback }
  }
  return {
    x: Math.max(0, Math.min(0.98, candidate.x)),
    y: Math.max(0, Math.min(0.98, candidate.y)),
    w: Math.max(0.01, Math.min(1 - candidate.x, candidate.w)),
    h: Math.max(0.01, Math.min(1 - candidate.y, candidate.h)),
  }
}

function readProfiles(): StoredProfiles {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as StoredProfiles) : {}
  } catch {
    return {}
  }
}

export function loadRegions(aspect: string): RegionMap {
  const stored = readProfiles()[aspect]
  const result = {} as RegionMap
  for (const field of FIELDS) {
    result[field.id] = sanitizeRegion(
      stored?.[field.id],
      DEFAULT_REGIONS[field.id],
    )
  }
  return result
}

export function saveRegions(aspect: string, regions: RegionMap) {
  try {
    const profiles = readProfiles()
    profiles[aspect] = regions
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
  } catch {
    // Storage can be unavailable (private mode, quota); calibration still works
    // for the current session.
  }
}

export function clearRegions(aspect: string) {
  try {
    const profiles = readProfiles()
    delete profiles[aspect]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
  } catch {
    // Ignore storage failures.
  }
}
