import { expect, test } from '@playwright/test'
import {
  EXPECTED_VALUES,
  dropFixture,
  fixturePath,
  pasteFixture,
  readValues,
  uploadFixture,
  waitForOcr,
} from './helpers'

test('file chooser input loads a screenshot', async ({ page }) => {
  await page.goto('/')
  const chooserPromise = page.waitForEvent('filechooser')
  await page.locator('.dropzone').click()
  const chooser = await chooserPromise
  await chooser.setFiles(fixturePath('image1.png'))
  await waitForOcr(page)
  expect(await readValues(page)).toEqual(EXPECTED_VALUES['image1.png'])
})

test('drag and drop loads a screenshot', async ({ page }) => {
  await page.goto('/')
  await dropFixture(page, 'image1.png')
  await waitForOcr(page)
  expect(await readValues(page)).toEqual(EXPECTED_VALUES['image1.png'])
})

test('paste loads a screenshot', async ({ page }) => {
  await page.goto('/')
  await pasteFixture(page, 'image2.png')
  await waitForOcr(page)
  expect(await readValues(page)).toEqual(EXPECTED_VALUES['image2.png'])
})

test('rejects a non-image file with a clear error', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type=file]').first().setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not an image'),
  })
  await expect(page.locator('.status--error')).toBeVisible()
  await expect(page.locator('.status--error')).toContainText('not an image')
})

test('calibration drags, saves, resets, and re-runs OCR', async ({ page }) => {
  await page.goto('/')
  await uploadFixture(page, 'image1.png')

  await page.getByRole('button', { name: 'Adjust regions' }).click()
  await expect(page.locator('.preview-frame')).toHaveClass(/is-calibrating/)
  await expect(page.locator('.region-box__handle')).toHaveCount(4)

  const systemBox = page.locator('.region-box--2')
  const bounds = await systemBox.boundingBox()
  expect(bounds).not.toBeNull()

  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    bounds!.x + bounds!.width / 2 + 10,
    bounds!.y + bounds!.height / 2 + 2,
    { steps: 4 },
  )
  await page.mouse.up()

  await expect(page.locator('.dirty-note')).toBeVisible()
  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem('game-screenshot-ocr:regions:v1')
    return raw ? JSON.parse(raw) : {}
  })
  expect(Object.keys(saved).length).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Reset regions to defaults' }).click()
  const afterReset = await page.evaluate(() => {
    const raw = localStorage.getItem('game-screenshot-ocr:regions:v1')
    return raw ? JSON.parse(raw) : {}
  })
  expect(afterReset['16:9']).toBeUndefined()

  await page.getByRole('button', { name: 'Re-run OCR' }).click()
  await waitForOcr(page)
  expect(await readValues(page)).toEqual(EXPECTED_VALUES['image1.png'])
})

test('copy all shows confirmation', async ({ page }) => {
  await page.goto('/')
  await uploadFixture(page, 'image1.png')
  await page.getByRole('button', { name: 'Copy all' }).click()
  await expect(page.locator('.toast')).toContainText('Copied all values')
})

test('footer links to the repository and deployed commit', async ({ page }) => {
  await page.goto('/')

  const repoLink = page.locator('.footer a', { hasText: 'GitHub' })
  await expect(repoLink).toHaveAttribute(
    'href',
    'https://github.com/cmdr-threethree/carrier-jump-ocr',
  )

  const commitLink = page.locator('.footer a.mono')
  await expect(commitLink).toBeVisible()
  await expect(commitLink).toHaveText(/^(?:[0-9a-f]{7}|dev)$/)
  await expect(commitLink).toHaveAttribute(
    'href',
    /^https:\/\/github\.com\/cmdr-threethree\/carrier-jump-ocr(?:\/commit\/[0-9a-f]+)?$/,
  )
})
