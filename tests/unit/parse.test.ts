import { describe, expect, it } from 'vitest'
import { parseName, parseTimer, stripTrailingNoise } from '../../src/lib/parse'

describe('parseTimer', () => {
  it('accepts a normal H:MM:SS value', () => {
    expect(parseTimer('6:49:40')).toEqual({ value: '6:49:40', status: 'ok' })
    expect(parseTimer('0:15:30')).toEqual({ value: '0:15:30', status: 'ok' })
    expect(parseTimer('8:30:25')).toEqual({ value: '8:30:25', status: 'ok' })
  })

  it('repairs missing or unusual separators', () => {
    expect(parseTimer('64940')).toEqual({
      value: '6:49:40',
      status: 'ok',
      note: 'Separators repaired',
    })
    expect(parseTimer('0.13.45')).toEqual({ value: '0:13:45', status: 'ok' })
    expect(parseTimer('0;13;45')).toEqual({ value: '0:13:45', status: 'ok' })
  })

  it('ignores surrounding text', () => {
    expect(parseTimer(' 6:49:40 ')).toEqual({ value: '6:49:40', status: 'ok' })
    expect(parseTimer('time 6:49:40')).toEqual({ value: '6:49:40', status: 'ok' })
  })

  it('maps common OCR lookalikes', () => {
    expect(parseTimer('6:49:4O')).toEqual({ value: '6:49:40', status: 'ok' })
    expect(parseTimer('O:15:3O')).toEqual({ value: '0:15:30', status: 'ok' })
  })

  it('rejects out-of-range values', () => {
    expect(parseTimer('6:99:40').status).toBe('review')
    expect(parseTimer('6:49:99').status).toBe('review')
    expect(parseTimer('29:00:00', 23).status).toBe('review')
  })

  it('rejects text without a readable timer', () => {
    expect(parseTimer('').status).toBe('review')
    expect(parseTimer('abc').status).toBe('review')
    expect(parseTimer('123').status).toBe('review')
  })
})

describe('parseName', () => {
  it('accepts system names', () => {
    expect(parseName('HD 104495')).toEqual({ value: 'HD 104495', status: 'ok' })
    expect(parseName('HIP 58832')).toEqual({ value: 'HIP 58832', status: 'ok' })
    expect(parseName('LHS 3447')).toEqual({ value: 'LHS 3447', status: 'ok' })
    expect(parseName('Synuefe XR-H d11-102')).toEqual({
      value: 'Synuefe XR-H d11-102',
      status: 'ok',
    })
  })

  it('normalizes whitespace and edges', () => {
    expect(parseName('  HD   105341  ')).toEqual({ value: 'HD 105341', status: 'ok' })
    expect(parseName(' HD 104495 - ')).toEqual({ value: 'HD 104495', status: 'ok' })
  })

  it('strips unexpected punctuation', () => {
    expect(parseName('HD 104495.')).toEqual({ value: 'HD 104495', status: 'ok' })
    expect(parseName('(HIP 58832)')).toEqual({ value: 'HIP 58832', status: 'ok' })
  })

  it('rejects empty or implausible text', () => {
    expect(parseName('').status).toBe('review')
    expect(parseName('!!!').status).toBe('review')
    expect(parseName('A').status).toBe('review')
  })

  it('flags very long names as possibly clipped', () => {
    expect(parseName('A'.repeat(60)).status).toBe('review')
  })
})

describe('stripTrailingNoise', () => {
  it('drops a short trailing token when the raw line has a wide gap', () => {
    const values = ['HIP 58832 T', 'HIP 58832', 'HIP 58832 CT']
    expect(stripTrailingNoise('HIP 58832 T', 'HIP 58832        T', values)).toBe(
      'HIP 58832',
    )
    expect(stripTrailingNoise('HIP 58832 CT', 'HIP 58832        CT', values)).toBe(
      'HIP 58832',
    )
  })

  it('leaves a trailing token alone when no variant read the base name', () => {
    expect(
      stripTrailingNoise(
        'HIP 58832 T',
        'HIP 58832        T',
        ['HIP 58832 T', 'HIP 58832 CT'],
      ),
    ).toBe('HIP 58832 T')
  })

  it('keeps legitimate short suffixes after a normal space', () => {
    expect(stripTrailingNoise('Gliese 667 C', 'Gliese 667 C', ['Gliese 667'])).toBe(
      'Gliese 667 C',
    )
  })

  it('does not touch names without a numeric suffix', () => {
    expect(stripTrailingNoise('Rigel T', 'Rigel       T', ['Rigel'])).toBe('Rigel T')
  })
})
