import { buildVariantCanvases, cropLastWord, cropWordBox, prepareVariants } from './preprocess'
import { recognizeDigits, recognizeVariant, recognizeWithWords } from './ocr'
import { parseName, parseTimer } from './parse'
import type { ContentRect, FieldDef, FieldResult, RegionRect } from './types'

interface Candidate {
  raw: string
  value: string
  status: 'ok' | 'review'
  note?: string
  confidence: number
  variant: string
  baseScore: number
  score: number
}

function parseForField(field: FieldDef, raw: string) {
  if (field.kind === 'timer') {
    return parseTimer(raw, field.maxHours ?? 99)
  }
  return parseName(raw)
}

function makeCropPreview(source: HTMLCanvasElement): string {
  const maxWidth = 360
  const scale = Math.min(1, maxWidth / source.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.width * scale))
  canvas.height = Math.max(1, Math.round(source.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

/**
 * Several preprocessing variants often disagree by one character. Boost values
 * that multiple variants agree on, and strip a noisy leading token when the
 * rest of the value is repeated elsewhere (e.g. "IV HD 105341" -> "HD 105341").
 */
function applyAgreement(candidates: Candidate[]) {
  if (candidates.length === 0) return

  const tally = new Map<string, { count: number; confidence: number }>()
  for (const candidate of candidates) {
    if (!candidate.value) continue
    const current = tally.get(candidate.value)
    if (current) {
      current.count++
      current.confidence = Math.max(current.confidence, candidate.confidence)
    } else {
      tally.set(candidate.value, { count: 1, confidence: candidate.confidence })
    }
  }

  const ranked = [...tally.entries()].sort(
    (a, b) => b[1].count - a[1].count || b[1].confidence - a[1].confidence,
  )
  const modalValue = ranked[0]?.[0]

  if (modalValue && modalValue.includes(' ')) {
    for (const candidate of candidates) {
      if (
        candidate.value &&
        candidate.value !== modalValue &&
        candidate.value.endsWith(` ${modalValue}`)
      ) {
        const prefix = candidate.value.slice(0, -(modalValue.length + 1))
        if (prefix.length <= 4) {
          candidate.value = modalValue
          candidate.status = 'ok'
          candidate.note = 'Leading noise removed'
        }
      }
    }
  }

  const finalTally = new Map<string, number>()
  for (const candidate of candidates) {
    if (!candidate.value) continue
    finalTally.set(candidate.value, (finalTally.get(candidate.value) ?? 0) + 1)
  }

  for (const candidate of candidates) {
    const count = finalTally.get(candidate.value) ?? 0
    candidate.score = candidate.baseScore + Math.min(16, Math.max(0, count - 1) * 8)
  }
}

/**
 * For simple names like "HD 104495" the letters and digits can be read in
 * separate passes. A digits-only pass on the isolated numeric word is often
 * more reliable for the suffix, so use it when it returns a plausible length.
 */
async function refineNumericSuffix(
  field: FieldDef,
  best: Candidate,
  prepared: ReturnType<typeof prepareVariants>,
  candidates: Candidate[],
): Promise<Candidate> {
  if (field.kind !== 'name' || best.status !== 'ok') return best
  const match = best.value.match(/^([A-Za-z][A-Za-z ]*?)\s+(\d+)$/)
  if (!match) return best

  const suffixLength = match[2].length
  const bestSuffix = match[2]
  const observedSuffixes = new Map<string, number>()
  for (const candidate of candidates) {
    const candidateMatch = candidate.value.match(/^[A-Za-z][A-Za-z ]*?\s+(\d+)$/)
    if (candidateMatch) {
      observedSuffixes.set(
        candidateMatch[1],
        (observedSuffixes.get(candidateMatch[1]) ?? 0) + 1,
      )
    }
  }
  const wordCanvases: HTMLCanvasElement[] = []

  const variant = prepared.variants.find((item) => item.name === best.variant)
  if (variant) {
    try {
      const withWords = await recognizeWithWords(variant.canvas, 'name')
      const digitWord = [...withWords.words]
        .reverse()
        .find((word) => /\d/.test(word.text))
      if (digitWord) {
        const wordCanvas = cropWordBox(prepared.source, digitWord.bbox)
        if (wordCanvas) wordCanvases.push(wordCanvas)
      }
    } catch (error) {
      console.error(`Word lookup failed for ${field.id}`, error)
    }
  }

  if (wordCanvases.length === 0) {
    const word = cropLastWord(prepared.source)
    if (word) wordCanvases.push(word)
  }

  const sources =
    wordCanvases.length > 0
      ? wordCanvases.flatMap((canvas) => buildVariantCanvases(canvas, 'timer'))
      : prepared.variants.filter((item) => item.name === best.variant)

  const readings: Array<{ digits: string; confidence: number; variant: string }> = []
  for (const source of sources) {
    try {
      const result = await recognizeDigits(source.canvas)
      const digits = (result.text.match(/\d/g) ?? []).join('')
      if (digits) {
        readings.push({ digits, confidence: result.confidence, variant: source.name })
      }
    } catch (error) {
      console.error(`Suffix refinement failed for ${field.id} (${source.name})`, error)
    }
  }
  if (readings.length === 0) return best

  const plausible = readings.filter(
    (reading) => Math.abs(reading.digits.length - suffixLength) <= 1,
  )
  const pool = plausible.length > 0 ? plausible : readings

  const tally = new Map<string, { count: number; confidence: number }>()
  for (const reading of pool) {
    const current = tally.get(reading.digits)
    if (current) {
      current.count++
      current.confidence = Math.max(current.confidence, reading.confidence)
    } else {
      tally.set(reading.digits, { count: 1, confidence: reading.confidence })
    }
  }

  const ranked = [...tally.entries()].sort((a, b) => {
    if (b[1].count !== a[1].count) return b[1].count - a[1].count
    if (b[1].confidence !== a[1].confidence) return b[1].confidence - a[1].confidence
    return (
      Math.abs(a[0].length - suffixLength) - Math.abs(b[0].length - suffixLength)
    )
  })

  const digits = ranked[0]?.[0]
  if (!digits) return best

  const combined = `${match[1]} ${digits}`
  if (combined === best.value) return best

  const refinedSupport = observedSuffixes.get(digits) ?? 0
  const bestSupport = observedSuffixes.get(bestSuffix) ?? 0

  // If the refined suffix has no support from any whole-line reading, only
  // trust it when the original suffix was not well supported either.
  if (refinedSupport === 0 && bestSupport >= 2) {
    return best
  }

  return {
    ...best,
    value: combined,
    status: refinedSupport === 0 ? 'review' : best.status,
    note: refinedSupport === 0 ? 'Numeric suffix uncertain' : 'Numeric suffix refined',
  }
}

export async function extractField(
  bitmap: ImageBitmap,
  content: ContentRect,
  region: RegionRect,
  field: FieldDef,
): Promise<FieldResult> {
  const prepared = prepareVariants(bitmap, content, region, field.kind)
  const cropUrl = makeCropPreview(prepared.source)
  const candidates: Candidate[] = []

  for (const variant of prepared.variants) {
    let raw = ''
    let confidence = 0
    try {
      const recognized = await recognizeVariant(variant.canvas, field.kind)
      raw = recognized.text
      confidence = recognized.confidence
    } catch (error) {
      console.error(`OCR failed for ${field.id} (${variant.name})`, error)
      continue
    }

    const parsed = parseForField(field, raw)
    const validBonus = parsed.status === 'ok' ? 40 : -20
    const emptyPenalty = parsed.value ? 0 : -30
    const repairPenalty = parsed.note === 'Separators repaired' ? -5 : 0
    const baseScore = confidence + validBonus + emptyPenalty + repairPenalty

    candidates.push({
      raw,
      value: parsed.value,
      status: parsed.status,
      note: parsed.note,
      confidence,
      variant: variant.name,
      baseScore,
      score: baseScore,
    })
  }

  if (candidates.length === 0) {
    return {
      id: field.id,
      raw: '',
      value: '',
      confidence: 0,
      status: 'review',
      note: 'OCR failed',
      variant: 'none',
      cropUrl,
    }
  }

  applyAgreement(candidates)

  const sorted = [...candidates].sort((a, b) => b.score - a.score)
  let best = sorted[0]

  if (field.kind === 'name') {
    best = await refineNumericSuffix(field, best, prepared, candidates)
  }

  return {
    id: field.id,
    raw: best.raw,
    value: best.value,
    confidence: Math.round(best.confidence),
    status: best.status,
    note: best.note,
    variant: best.variant,
    cropUrl,
  }
}
