import type { ContentRect, FieldKind, RegionRect } from './types'

const TARGET_TEXT_HEIGHT = 96
const PAD_X = 16
const PAD_Y = 12

export interface PreparedVariants {
  variants: Array<{ name: string; canvas: HTMLCanvasElement }>
  source: HTMLCanvasElement
  band: TextBand | null
}

interface TextBand {
  top: number
  bottom: number
  sum: number
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

function getContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D is unavailable in this browser.')
  return ctx
}

function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function otsuThreshold(data: Uint8ClampedArray): number {
  const histogram = new Uint32Array(256)
  let total = 0
  for (let i = 0; i < data.length; i += 4) {
    const value = Math.round(luma(data[i], data[i + 1], data[i + 2]))
    histogram[value]++
    total++
  }
  if (total === 0) return 128

  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * histogram[i]

  let sumBackground = 0
  let weightBackground = 0
  let bestVariance = -1
  let threshold = 128

  for (let i = 0; i < 256; i++) {
    weightBackground += histogram[i]
    if (weightBackground === 0) continue
    const weightForeground = total - weightBackground
    if (weightForeground === 0) break
    sumBackground += i * histogram[i]
    const meanBackground = sumBackground / weightBackground
    const meanForeground = (sum - sumBackground) / weightForeground
    const diff = meanBackground - meanForeground
    const variance = weightBackground * weightForeground * diff * diff
    if (variance > bestVariance) {
      bestVariance = variance
      threshold = i
    }
  }
  return threshold
}

function regionPixels(
  bitmap: ImageBitmap,
  content: ContentRect,
  region: RegionRect,
): { sx: number; sy: number; sw: number; sh: number; canvas: HTMLCanvasElement } {
  const sx = Math.max(0, Math.floor(content.x + region.x * content.width))
  const sy = Math.max(0, Math.floor(content.y + region.y * content.height))
  const sw = Math.max(
    1,
    Math.min(bitmap.width - sx, Math.ceil(region.w * content.width)),
  )
  const sh = Math.max(
    1,
    Math.min(bitmap.height - sy, Math.ceil(region.h * content.height)),
  )

  const canvas = makeCanvas(sw, sh)
  getContext(canvas).drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh)
  return { sx, sy, sw, sh, canvas }
}

/**
 * Locate the dominant text line inside a crop. A generous region may contain
 * part of a localized label or the date below the clock; the value line is the
 * one with the most lit pixels.
 */
function findTextBand(canvas: HTMLCanvasElement): TextBand | null {
  const ctx = getContext(canvas)
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const threshold = otsuThreshold(data)
  const rowCounts = new Uint32Array(canvas.height)
  const rowSums = new Uint32Array(canvas.height)

  for (let y = 0; y < canvas.height; y++) {
    let count = 0
    let sum = 0
    const rowStart = y * canvas.width * 4
    for (let x = 0; x < canvas.width; x++) {
      const offset = rowStart + x * 4
      const value = luma(data[offset], data[offset + 1], data[offset + 2])
      if (value > threshold) {
        count++
        sum += value
      }
    }
    rowCounts[y] = count
    rowSums[y] = sum
  }

  const minCount = Math.max(2, Math.round(canvas.width * 0.01))
  const bands: TextBand[] = []
  let current: TextBand | null = null
  let gap = 0

  for (let y = 0; y < canvas.height; y++) {
    if (rowCounts[y] >= minCount) {
      if (!current) {
        current = { top: y, bottom: y, sum: 0 }
      }
      current.bottom = y
      current.sum += rowSums[y]
      gap = 0
    } else if (current) {
      gap++
      if (gap > 1) {
        bands.push(current)
        current = null
        gap = 0
      }
    }
  }
  if (current) bands.push(current)

  const usable = bands.filter((band) => band.bottom - band.top + 1 >= 2)
  if (usable.length === 0) return null

  usable.sort((a, b) => b.sum - a.sum)
  return usable[0]
}

export function prepareVariants(
  bitmap: ImageBitmap,
  content: ContentRect,
  region: RegionRect,
  kind: FieldKind,
): PreparedVariants {
  const { sx, sy, sw, sh, canvas: regionCanvas } = regionPixels(bitmap, content, region)
  const band = findTextBand(regionCanvas)

  const pad = 2
  const lineTop = band ? Math.max(0, band.top - pad) : 0
  const lineBottom = band ? Math.min(sh - 1, band.bottom + pad) : sh - 1
  const lineHeight = Math.max(1, lineBottom - lineTop + 1)
  const lineWidth = sw

  let scale = (kind === 'name' ? 144 : TARGET_TEXT_HEIGHT) / lineHeight
  scale = Math.max(2, Math.min(12, scale))
  let outWidth = Math.round(lineWidth * scale) + PAD_X * 2
  const outHeight = Math.round(lineHeight * scale) + PAD_Y * 2
  if (outWidth > 4096) {
    const shrink = 4096 / outWidth
    scale *= shrink
    outWidth = Math.round(lineWidth * scale) + PAD_X * 2
  }

  const source = makeCanvas(outWidth, outHeight)
  const sourceCtx = getContext(source)
  sourceCtx.fillStyle = '#000'
  sourceCtx.fillRect(0, 0, source.width, source.height)
  sourceCtx.imageSmoothingEnabled = true
  sourceCtx.imageSmoothingQuality = 'high'
  sourceCtx.drawImage(
    bitmap,
    sx,
    sy + lineTop,
    lineWidth,
    lineHeight,
    PAD_X,
    PAD_Y,
    outWidth - PAD_X * 2,
    outHeight - PAD_Y * 2,
  )

  return {
    source,
    band,
    variants: buildVariants(source, kind),
  }
}

function buildVariants(
  source: HTMLCanvasElement,
  kind: FieldKind,
): Array<{ name: string; canvas: HTMLCanvasElement }> {
  const variants = [
    { name: 'threshold', canvas: thresholdCanvas(source, 0) },
    { name: 'gray', canvas: grayscaleCanvas(source) },
  ]
  if (kind === 'name') {
    variants.push({ name: 'hud-color', canvas: colorMaskCanvas(source) })
    variants.push({ name: 'threshold-low', canvas: thresholdCanvas(source, -18) })
    variants.push({ name: 'threshold-very-low', canvas: thresholdCanvas(source, -32) })
  } else {
    variants.push({ name: 'threshold-low', canvas: thresholdCanvas(source, -18) })
  }
  variants.push({ name: 'threshold-high', canvas: thresholdCanvas(source, 18) })
  return variants
}

function thresholdCanvas(source: HTMLCanvasElement, offset: number): HTMLCanvasElement {
  const canvas = makeCanvas(source.width, source.height)
  const ctx = getContext(canvas)
  ctx.drawImage(source, 0, 0)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = image.data
  const threshold = Math.max(1, Math.min(254, otsuThreshold(data) + offset))

  for (let i = 0; i < data.length; i += 4) {
    const value = luma(data[i], data[i + 1], data[i + 2])
    const output = value > threshold ? 0 : 255
    data[i] = output
    data[i + 1] = output
    data[i + 2] = output
    data[i + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

function grayscaleCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = makeCanvas(source.width, source.height)
  const ctx = getContext(canvas)
  ctx.drawImage(source, 0, 0)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = image.data
  let min = 255
  let max = 0

  for (let i = 0; i < data.length; i += 4) {
    const value = luma(data[i], data[i + 1], data[i + 2])
    if (value < min) min = value
    if (value > max) max = value
  }
  const range = Math.max(1, max - min)

  for (let i = 0; i < data.length; i += 4) {
    const value = luma(data[i], data[i + 1], data[i + 2])
    // Invert: Tesseract prefers dark glyphs on a light background.
    const output = Math.round(255 - ((value - min) / range) * 255)
    data[i] = output
    data[i + 1] = output
    data[i + 2] = output
    data[i + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

/**
 * Isolate saturated HUD-coloured text. The dominant hue is measured from the
 * crop, so this also works when the player has recoloured the game HUD.
 */
function colorMaskCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = makeCanvas(source.width, source.height)
  const ctx = getContext(canvas)
  ctx.drawImage(source, 0, 0)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = image.data
  const hueBins = new Uint32Array(36)
  const hues = new Uint16Array(canvas.width * canvas.height)
  const sats = new Uint8Array(canvas.width * canvas.height)
  const vals = new Uint8Array(canvas.width * canvas.height)

  for (let pixel = 0, i = 0; i < data.length; i += 4, pixel++) {
    const r = data[i] / 255
    const g = data[i + 1] / 255
    const b = data[i + 2] / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const delta = max - min
    let hue = 0
    if (delta > 0) {
      if (max === r) hue = ((g - b) / delta) % 6
      else if (max === g) hue = (b - r) / delta + 2
      else hue = (r - g) / delta + 4
      hue *= 60
      if (hue < 0) hue += 360
    }
    const sat = max === 0 ? 0 : delta / max
    hues[pixel] = Math.round(hue) % 360
    sats[pixel] = Math.round(sat * 255)
    vals[pixel] = Math.round(max * 255)
    if (sat > 0.35 && max > 0.2) {
      hueBins[Math.floor(hue / 10) % 36]++
    }
  }

  let peakBin = -1
  let peakCount = 0
  for (let i = 0; i < hueBins.length; i++) {
    if (hueBins[i] > peakCount) {
      peakCount = hueBins[i]
      peakBin = i
    }
  }

  const usesColor = peakCount > (canvas.width * canvas.height) * 0.01
  const peakHue = peakBin < 0 ? 0 : peakBin * 10 + 5

  for (let pixel = 0, i = 0; i < data.length; i += 4, pixel++) {
    let isText = false
    if (usesColor) {
      const saturation = sats[pixel] / 255
      const value = vals[pixel] / 255
      let hueDistance = Math.abs(hues[pixel] - peakHue)
      if (hueDistance > 180) hueDistance = 360 - hueDistance
      isText = saturation > 0.28 && value > 0.2 && hueDistance <= 30
    } else {
      isText = vals[pixel] > 80
    }
    const output = isText ? 0 : 255
    data[i] = output
    data[i + 1] = output
    data[i + 2] = output
    data[i + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

export function buildVariantCanvases(
  source: HTMLCanvasElement,
  kind: FieldKind,
): Array<{ name: string; canvas: HTMLCanvasElement }> {
  return buildVariants(source, kind)
}

/**
 * Isolate the right-most word in an upscaled name line. Numeric suffixes such
 * as "104495" are the main source of single-character errors, and OCR'ing them
 * without the letter prefix is noticeably more reliable.
 */
export function cropLastWord(source: HTMLCanvasElement): HTMLCanvasElement | null {
  const ctx = getContext(source)
  const { data } = ctx.getImageData(0, 0, source.width, source.height)
  const threshold = otsuThreshold(data)
  const counts = new Uint32Array(source.width)
  const sums = new Uint32Array(source.width)

  for (let y = 0; y < source.height; y++) {
    const rowStart = y * source.width * 4
    for (let x = 0; x < source.width; x++) {
      const offset = rowStart + x * 4
      const value = luma(data[offset], data[offset + 1], data[offset + 2])
      if (value > threshold) {
        counts[x]++
        sums[x] += value
      }
    }
  }

  const groups: Array<{ x0: number; x1: number; sum: number }> = []
  let current: { x0: number; x1: number; sum: number } | null = null
  let gap = 0
  for (let x = 0; x < source.width; x++) {
    if (counts[x] > 0) {
      if (!current) current = { x0: x, x1: x, sum: 0 }
      current.x1 = x
      current.sum += sums[x]
      gap = 0
    } else if (current) {
      gap++
      if (gap > 3) {
        groups.push(current)
        current = null
        gap = 0
      }
    }
  }
  if (current) groups.push(current)

  const usable = groups.filter((group) => group.x1 - group.x0 >= 5)
  if (usable.length === 0) return null

  const rightSide = usable.filter(
    (group) => (group.x0 + group.x1) / 2 > source.width * 0.35,
  )
  const pool = rightSide.length > 0 ? rightSide : usable
  pool.sort((a, b) => b.sum - a.sum)
  const word = pool[0]

  let y0 = source.height
  let y1 = 0
  for (let y = 0; y < source.height; y++) {
    const rowStart = y * source.width * 4
    for (let x = word.x0; x <= word.x1; x++) {
      const offset = rowStart + x * 4
      const value = luma(data[offset], data[offset + 1], data[offset + 2])
      if (value > threshold) {
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (y1 < y0) return null

  const verticalPad = Math.max(4, Math.round((y1 - y0 + 1) * 0.12))
  const horizontalPad = Math.max(8, Math.round((y1 - y0 + 1) * 0.18))
  const sx = Math.max(0, word.x0 - horizontalPad)
  const sy = Math.max(0, y0 - verticalPad)
  const sw = Math.min(source.width - sx, word.x1 - word.x0 + 1 + horizontalPad * 2)
  const sh = Math.min(source.height - sy, y1 - y0 + 1 + verticalPad * 2)

  const scale = Math.min(3, Math.max(1, 200 / sh))
  const canvas = makeCanvas(sw * scale + PAD_X * 2, sh * scale + PAD_Y * 2)
  const out = getContext(canvas)
  out.fillStyle = '#000'
  out.fillRect(0, 0, canvas.width, canvas.height)
  out.imageSmoothingEnabled = true
  out.imageSmoothingQuality = 'high'
  out.drawImage(
    source,
    sx,
    sy,
    sw,
    sh,
    PAD_X,
    PAD_Y,
    sw * scale,
    sh * scale,
  )
  return canvas
}

export function cropWordBox(
  source: HTMLCanvasElement,
  box: { x0: number; y0: number; x1: number; y1: number },
  targetHeight = 200,
): HTMLCanvasElement | null {
  const width = box.x1 - box.x0
  const height = box.y1 - box.y0
  if (width < 2 || height < 2) return null

  const verticalPad = Math.max(6, Math.round(height * 0.18))
  const leftPad = Math.max(6, Math.round(height * 0.18))
  const rightPad = Math.max(12, Math.round(height * 0.4))
  const sx = Math.max(0, Math.floor(box.x0 - leftPad))
  const sy = Math.max(0, Math.floor(box.y0 - verticalPad))
  const sw = Math.min(source.width - sx, Math.ceil(width + leftPad + rightPad))
  const sh = Math.min(source.height - sy, Math.ceil(height + verticalPad * 2))
  if (sw < 2 || sh < 2) return null

  const scale = Math.min(3, Math.max(1, targetHeight / sh))
  const canvas = makeCanvas(sw * scale + PAD_X * 2, sh * scale + PAD_Y * 2)
  const ctx = getContext(canvas)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, sx, sy, sw, sh, PAD_X, PAD_Y, sw * scale, sh * scale)
  return canvas
}
