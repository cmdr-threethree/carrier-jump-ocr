import { expect, test } from '@playwright/test'
import { EXPECTED_VALUES, readValues, uploadFixture } from './helpers'

for (const [name, expected] of Object.entries(EXPECTED_VALUES)) {
  test(`extracts all four values from ${name}`, async ({ page }) => {
    await page.goto('/')
    await uploadFixture(page, name as keyof typeof EXPECTED_VALUES)

    await expect(page.locator('.result-card')).toHaveCount(4)
    await expect(page.locator('.status--done')).toBeVisible()
    await expect(page.locator('.value-input')).toHaveCount(4)

    expect(await readValues(page)).toEqual(expected)
  })
}
