import { createWorker, OEM, PSM } from 'tesseract.js'
import type { Worker } from 'tesseract.js'
import type { FieldKind } from './types'

const TESSERACT_VERSION = '7.0.0'
const CDN_WORKER = `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/worker.min.js`
const CDN_CORE = `https://cdn.jsdelivr.net/npm/tesseract.js-core@${TESSERACT_VERSION}`

const TIMER_WHITELIST = '0123456789:'
const NAME_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -+'

export interface OcrProgress {
  status: string
  progress: number
}

let progressListener: ((progress: OcrProgress) => void) | null = null
let workerPromise: Promise<Worker> | null = null

export function setOcrProgressListener(listener: ((progress: OcrProgress) => void) | null) {
  progressListener = listener
}

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker(
      'eng',
      OEM.LSTM_ONLY,
      {
        workerPath: CDN_WORKER,
        corePath: CDN_CORE,
        logger: (message) => {
          progressListener?.({
            status: message.status,
            progress: message.progress,
          })
        },
      },
      {
        load_system_dawg: '0',
        load_freq_dawg: '0',
      },
    ).catch((error) => {
      workerPromise = null
      throw error
    })
  }
  return workerPromise
}

async function configureWorker(kind: FieldKind, whitelistOverride?: string) {
  const worker = await getWorker()
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
    tessedit_char_whitelist:
      whitelistOverride ?? (kind === 'timer' ? TIMER_WHITELIST : NAME_WHITELIST),
    preserve_interword_spaces: kind === 'name' ? '1' : '0',
    user_defined_dpi: '300',
  })
  return worker
}

export async function recognizeVariant(
  canvas: HTMLCanvasElement,
  kind: FieldKind,
  whitelistOverride?: string,
): Promise<{ text: string; confidence: number }> {
  const worker = await configureWorker(kind, whitelistOverride)
  const { data } = await worker.recognize(canvas)
  return {
    text: data.text.replace(/\s+$/g, '').trim(),
    confidence: data.confidence ?? 0,
  }
}

export interface OcrWord {
  text: string
  confidence: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

export async function recognizeWithWords(
  canvas: HTMLCanvasElement,
  kind: FieldKind,
): Promise<{ text: string; confidence: number; words: OcrWord[] }> {
  const worker = await configureWorker(kind)
  const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true })
  const words: OcrWord[] = []
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        for (const word of line.words) {
          words.push({
            text: word.text,
            confidence: word.confidence,
            bbox: word.bbox,
          })
        }
      }
    }
  }
  return {
    text: data.text.replace(/\s+$/g, '').trim(),
    confidence: data.confidence ?? 0,
    words,
  }
}

export async function recognizeDigits(
  canvas: HTMLCanvasElement,
): Promise<{ text: string; confidence: number }> {
  const worker = await getWorker()
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_WORD,
    tessedit_char_whitelist: '0123456789',
    preserve_interword_spaces: '0',
    classify_bln_numeric_mode: '1',
    user_defined_dpi: '300',
  })
  const { data } = await worker.recognize(canvas)
  return {
    text: data.text.replace(/\s+$/g, '').trim(),
    confidence: data.confidence ?? 0,
  }
}
