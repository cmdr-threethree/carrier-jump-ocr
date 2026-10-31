import { expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

export type FixtureName = 'image1.png' | 'image2.png'

export const EXPECTED_VALUES: Record<FixtureName, string[]> = {
  'image1.png': ['6:49:40', '0:15:30', 'HD 104495', 'HD 105341'],
  'image2.png': ['8:30:25', '0:13:45', 'HD 105341', 'HIP 58832'],
}

export interface ImageVariant {
  name: string
  cropTop: number
  width: number
  height: number
  format: string
  quality?: number
  grayscale?: boolean
  hueRotate?: number
}

export function fixturePath(name: FixtureName): string {
  return path.join(process.cwd(), 'tests', 'fixtures', name)
}

export function fixtureBase64(name: FixtureName): string {
  return readFileSync(fixturePath(name)).toString('base64')
}

export async function waitForOcr(page: Page): Promise<void> {
  const hadCompletedRun = (await page.locator('.status--done').count()) > 0
  if (hadCompletedRun) {
    await expect(page.locator('.status--done')).toHaveCount(0, { timeout: 15_000 })
  }
  await expect(page.locator('.status--done, .status--error')).toBeVisible({
    timeout: 180_000,
  })
  await expect(page.locator('.status--error')).toHaveCount(0)
}

export async function uploadFixture(page: Page, name: FixtureName): Promise<void> {
  await page.locator('input[type=file]').first().setInputFiles(fixturePath(name))
  await waitForOcr(page)
}

export async function uploadBuffer(
  page: Page,
  name: string,
  mimeType: string,
  buffer: Buffer,
): Promise<void> {
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name, mimeType, buffer })
  await waitForOcr(page)
}

export async function readValues(page: Page): Promise<string[]> {
  return page.locator('.value-input').evaluateAll((elements) =>
    elements.map((element) => (element as HTMLInputElement).value),
  )
}

export async function makeVariant(
  page: Page,
  sourceBase64: string,
  variant: ImageVariant,
): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    async ({ src, cropTop, width, height, format, quality, grayscale, hueRotate }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${src}`
      await image.decode()

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas 2D is unavailable')
      ctx.imageSmoothingQuality = 'high'
      if (grayscale) ctx.filter = 'grayscale(1)'
      else if (typeof hueRotate === 'number') ctx.filter = `hue-rotate(${hueRotate}deg)`
      ctx.drawImage(
        image,
        0,
        cropTop,
        image.naturalWidth,
        image.naturalHeight - cropTop,
        0,
        0,
        width,
        height,
      )
      return canvas.toDataURL(format, quality)
    },
    {
      src: sourceBase64,
      cropTop: variant.cropTop,
      width: variant.width,
      height: variant.height,
      format: variant.format,
      quality: variant.quality,
      grayscale: variant.grayscale,
      hueRotate: variant.hueRotate,
    },
  )
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

export async function pasteFixture(page: Page, name: FixtureName): Promise<void> {
  const base64 = fixtureBase64(name)
  await page.evaluate(
    ({ src, filename }) => {
      const bytes = Uint8Array.from(atob(src), (char) => char.charCodeAt(0))
      const file = new File([bytes], filename, { type: 'image/png' })
      const data = new DataTransfer()
      data.items.add(file)
      window.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      )
    },
    { src: base64, filename: name },
  )
}

export async function dropFixture(page: Page, name: FixtureName): Promise<void> {
  const base64 = fixtureBase64(name)
  await page.evaluate(
    ({ src, filename }) => {
      const bytes = Uint8Array.from(atob(src), (char) => char.charCodeAt(0))
      const file = new File([bytes], filename, { type: 'image/png' })
      const data = new DataTransfer()
      data.items.add(file)
      const dropzone = document.querySelector('.dropzone')
      if (!dropzone) throw new Error('Dropzone is not visible')
      dropzone.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: data,
          bubbles: true,
          cancelable: true,
        }),
      )
    },
    { src: base64, filename: name },
  )
}
