export interface ParseResult {
  value: string
  status: 'ok' | 'review'
  note?: string
}

const TIMER_CHAR_MAP: Record<string, string> = {
  O: '0',
  o: '0',
  Q: '0',
  D: '0',
  I: '1',
  l: '1',
  '|': '1',
  '!': '1',
  S: '5',
  s: '5',
  B: '8',
  Z: '2',
  z: '2',
  G: '6',
  T: '7',
  A: '4',
}

function normalizeTimerText(raw: string): string {
  return raw
    .split('')
    .map((char) => TIMER_CHAR_MAP[char] ?? char)
    .join('')
}

function pad2(value: string): string {
  return value.padStart(2, '0')
}

function formatTimer(hours: string, minutes: string, seconds: string): string {
  return `${Number(hours)}:${pad2(minutes)}:${pad2(seconds)}`
}

export function parseTimer(raw: string, maxHours = 99): ParseResult {
  const text = normalizeTimerText(raw)

  const patterned = text.match(/(\d{1,2})\s*[:.;,，]\s*(\d{1,2})\s*[:.;,，]\s*(\d{1,2})/)
  if (patterned) {
    const [, h, m, s] = patterned
    if (Number(m) < 60 && Number(s) < 60 && Number(h) <= maxHours) {
      return { value: formatTimer(h, m, s), status: 'ok' }
    }
    return { value: raw.trim(), status: 'review', note: 'Timer is out of range' }
  }

  const digits = text.replace(/\D/g, '')
  if (digits.length === 5 || digits.length === 6) {
    const seconds = digits.slice(-2)
    const minutes = digits.slice(-4, -2)
    const hours = digits.slice(0, -4)
    if (Number(minutes) < 60 && Number(seconds) < 60 && Number(hours) <= maxHours) {
      return {
        value: formatTimer(hours, minutes, seconds),
        status: 'ok',
        note: 'Separators repaired',
      }
    }
  }

  return { value: raw.trim(), status: 'review', note: 'Could not read a timer' }
}

/**
 * A generous name region can include the start of the next HUD section. OCR
 * sometimes reads that fragment as a short trailing token (e.g. the localized
 * "Next jump" label turns "HIP 58832" into "HIP 58832 T"). Only drop the token
 * when the OCR line shows an unusually wide gap before it and another
 * preprocessing variant already returned the exact base name. Legitimate names
 * such as "Gliese 667 C" keep their normal single-space suffix.
 */
export function stripTrailingNoise(
  value: string,
  raw: string,
  knownValues: Iterable<string>,
): string {
  const match = value.match(/^(.+\d)\s+([A-Za-z]{1,2})$/)
  if (!match) return value

  const trailing = raw.trimEnd().match(/\s{3,}([A-Za-z]{1,2})$/)
  if (!trailing || trailing[1] !== match[2]) return value

  const base = match[1].trim()
  for (const known of knownValues) {
    if (known === base) return base
  }
  return value
}

export function parseName(raw: string): ParseResult {
  const value = raw
    .replace(/[^A-Za-z0-9 +\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[+\- ]+|[+\- ]+$/g, '')
    .trim()

  if (!value) {
    return { value: '', status: 'review', note: 'No text detected' }
  }

  const lettersAndDigits = value.replace(/[^A-Za-z0-9]/g, '')
  if (lettersAndDigits.length < 2) {
    return { value, status: 'review', note: 'Text looks too short' }
  }
  if (value.length > 48) {
    return { value, status: 'review', note: 'Name may be clipped' }
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9 +\-]*$/.test(value)) {
    return { value, status: 'review', note: 'Unexpected characters' }
  }
  return { value, status: 'ok' }
}
