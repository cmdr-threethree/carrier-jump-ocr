import type { ContentRect } from './types'

export async function decodeImage(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file)
}

/**
 * Screenshots are commonly a 16:9 game window plus a Windows title bar.
 * If the extra top band is small enough to plausibly be window chrome, trim it.
 * Clean full-screen captures and unusual aspect ratios are left untouched and
 * can be corrected with the "top offset" control.
 */
export function detectContentTop(width: number, height: number): number {
  const idealTop = height - (width * 9) / 16
  if (!Number.isFinite(idealTop)) return 0
  if (idealTop < 4) return 0
  if (idealTop > height * 0.08) return 0
  return Math.round(idealTop)
}

export function makeContentRect(
  imageWidth: number,
  imageHeight: number,
  top: number,
): ContentRect {
  const safeTop = Math.max(0, Math.min(Math.round(top), imageHeight - 1))
  return {
    x: 0,
    y: safeTop,
    width: imageWidth,
    height: imageHeight - safeTop,
  }
}

export function aspectLabel(content: ContentRect): string {
  const ratio = content.width / content.height
  const known: Array<[string, number]> = [
    ['16:9', 16 / 9],
    ['16:10', 16 / 10],
    ['21:9', 21 / 9],
    ['4:3', 4 / 3],
  ]
  for (const [label, value] of known) {
    if (Math.abs(ratio - value) < 0.07) return label
  }
  return ratio.toFixed(2)
}
