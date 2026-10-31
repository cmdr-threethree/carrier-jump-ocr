import { describe, expect, it } from 'vitest'
import { REPO_URL, commitUrl, shortCommit } from '../../src/lib/buildInfo'

describe('shortCommit', () => {
  it('shortens a full git SHA', () => {
    expect(shortCommit('52c8ea6b8f8b0d1f5b2c4a8e9d7c6b5a4f3e2d1c')).toBe('52c8ea6')
  })

  it('supports a custom length', () => {
    expect(shortCommit('52c8ea6b8f8b', 10)).toBe('52c8ea6b8f')
  })

  it('falls back to dev when no SHA is available', () => {
    expect(shortCommit('')).toBe('dev')
    expect(shortCommit('dev')).toBe('dev')
  })
})

describe('commitUrl', () => {
  it('links to the commit when a SHA is available', () => {
    expect(commitUrl('52c8ea6b8f8b')).toBe(
      `${REPO_URL}/commit/52c8ea6b8f8b`,
    )
  })

  it('links to the repository when no SHA is available', () => {
    expect(commitUrl('dev')).toBe(REPO_URL)
    expect(commitUrl('')).toBe(REPO_URL)
  })
})
