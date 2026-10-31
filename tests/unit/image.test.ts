import { describe, expect, it } from 'vitest'
import { aspectLabel, detectContentTop, makeContentRect } from '../../src/lib/image'

describe('detectContentTop', () => {
  it('trims a Windows title bar from a 16:9 window capture', () => {
    expect(detectContentTop(1602, 932)).toBe(31)
    expect(detectContentTop(1280, 744)).toBe(24)
    expect(detectContentTop(1920, 1117)).toBe(37)
  })

  it('leaves clean 16:9 captures alone', () => {
    expect(detectContentTop(1920, 1080)).toBe(0)
    expect(detectContentTop(2560, 1440)).toBe(0)
    expect(detectContentTop(3840, 2160)).toBe(0)
  })

  it('does not trim large or unlikely top bands', () => {
    expect(detectContentTop(800, 600)).toBe(0)
    expect(detectContentTop(1600, 1000)).toBe(0)
  })
})

describe('makeContentRect', () => {
  it('creates a rect below the detected top offset', () => {
    expect(makeContentRect(1602, 932, 31)).toEqual({
      x: 0,
      y: 31,
      width: 1602,
      height: 901,
    })
  })

  it('clamps the top offset to the image', () => {
    expect(makeContentRect(1600, 900, -10)).toEqual({
      x: 0,
      y: 0,
      width: 1600,
      height: 900,
    })
    expect(makeContentRect(1600, 900, 5000)).toEqual({
      x: 0,
      y: 899,
      width: 1600,
      height: 1,
    })
  })
})

describe('aspectLabel', () => {
  it('recognizes common aspect ratios', () => {
    expect(aspectLabel({ x: 0, y: 0, width: 1600, height: 900 })).toBe('16:9')
    expect(aspectLabel({ x: 0, y: 0, width: 1920, height: 1200 })).toBe('16:10')
    expect(aspectLabel({ x: 0, y: 0, width: 3440, height: 1440 })).toBe('21:9')
    expect(aspectLabel({ x: 0, y: 0, width: 800, height: 600 })).toBe('4:3')
  })

  it('falls back to a numeric ratio', () => {
    expect(aspectLabel({ x: 0, y: 0, width: 1000, height: 1000 })).toBe('1.00')
  })
})
