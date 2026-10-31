import { expect, test } from '@playwright/test'
import {
  EXPECTED_VALUES,
  fixtureBase64,
  makeVariant,
  readValues,
  uploadBuffer,
  type ImageVariant,
} from './helpers'

const VARIANTS: ImageVariant[] = [
  { name: 'windowed-1280x744', cropTop: 0, width: 1280, height: 744, format: 'image/png' },
  { name: 'windowed-1920x1117', cropTop: 0, width: 1920, height: 1117, format: 'image/png' },
  { name: 'content-1280x720', cropTop: 32, width: 1280, height: 720, format: 'image/png' },
  { name: 'content-1920x1080', cropTop: 32, width: 1920, height: 1080, format: 'image/png' },
  { name: 'content-2560x1440', cropTop: 32, width: 2560, height: 1440, format: 'image/png' },
  { name: 'content-3840x2160', cropTop: 32, width: 3840, height: 2160, format: 'image/png' },
  {
    name: 'content-1920x1080-jpeg',
    cropTop: 32,
    width: 1920,
    height: 1080,
    format: 'image/jpeg',
    quality: 0.92,
  },
  {
    name: 'content-1920x1080-webp',
    cropTop: 32,
    width: 1920,
    height: 1080,
    format: 'image/webp',
    quality: 0.95,
  },
  {
    name: 'content-1920x1080-grayscale',
    cropTop: 32,
    width: 1920,
    height: 1080,
    format: 'image/png',
    grayscale: true,
  },
  {
    name: 'content-1920x1080-hue',
    cropTop: 32,
    width: 1920,
    height: 1080,
    format: 'image/png',
    hueRotate: 170,
  },
]

for (const image of ['image1.png', 'image2.png'] as const) {
  test(`${image} extracts correctly across resolutions, formats, and HUD colors`, async ({
    page,
  }) => {
    await page.goto('/')
    const source = fixtureBase64(image)

    for (const variant of VARIANTS) {
      const buffer = await makeVariant(page, source, variant)
      await uploadBuffer(page, `${image}-${variant.name}`, variant.format, buffer)
      expect
        .soft(await readValues(page), `${image} / ${variant.name}`)
        .toEqual(EXPECTED_VALUES[image])
    }
  })
}
