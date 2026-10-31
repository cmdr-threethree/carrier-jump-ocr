import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DropZone from './components/DropZone'
import RegionOverlay from './components/RegionOverlay'
import ResultCard from './components/ResultCard'
import { COMMIT_SHA, COMMIT_URL, REPO_URL, SHORT_COMMIT } from './lib/buildInfo'
import { DEFAULT_REGIONS, FIELDS, cloneRegions } from './lib/constants'
import { extractField } from './lib/extract'
import { aspectLabel, decodeImage, detectContentTop, makeContentRect } from './lib/image'
import { setOcrProgressListener } from './lib/ocr'
import { clearRegions, loadRegions, saveRegions } from './lib/regions'
import type {
  ContentRect,
  FieldId,
  FieldResult,
  LoadedImage,
  RegionRect,
} from './lib/types'

type Phase = 'idle' | 'decoding' | 'processing' | 'done' | 'error'

type RegionMap = Record<FieldId, RegionRect>
type ResultMap = Partial<Record<FieldId, FieldResult>>

const INIT_PROGRESS_STATUSES = new Set([
  'loading tesseract core',
  'initializing tesseract',
  'loading language traineddata',
  'initializing api',
])

function copyFallback(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(textarea)
  return ok
}

export default function App() {
  const [loaded, setLoaded] = useState<LoadedImage | null>(null)
  const [topOffset, setTopOffset] = useState(0)
  const [regions, setRegions] = useState<RegionMap>(() => cloneRegions(DEFAULT_REGIONS))
  const [results, setResults] = useState<ResultMap>({})
  const [phase, setPhase] = useState<Phase>('idle')
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [calibrating, setCalibrating] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState<number | null>(null)

  const runIdRef = useRef(0)
  const loadedRef = useRef<LoadedImage | null>(null)
  const newInputRef = useRef<HTMLInputElement>(null)
  const copyTimerRef = useRef<number | null>(null)

  const content = useMemo<ContentRect | null>(() => {
    if (!loaded) return null
    return makeContentRect(loaded.width, loaded.height, topOffset)
  }, [loaded, topOffset])

  const aspect = useMemo(() => (content ? aspectLabel(content) : ''), [content])

  useEffect(() => {
    setOcrProgressListener(({ status, progress: value }) => {
      if (!INIT_PROGRESS_STATUSES.has(status)) return
      const labels: Record<string, string> = {
        'loading tesseract core': 'Loading OCR engine',
        'initializing tesseract': 'Initializing OCR engine',
        'loading language traineddata': 'Loading language data',
        'initializing api': 'Starting OCR',
      }
      setMessage(`${labels[status] ?? status}… ${Math.round(value * 100)}%`)
      setProgress(Math.round(value * 100))
    })
    return () => setOcrProgressListener(null)
  }, [])

  useEffect(() => {
    return () => {
      loadedRef.current?.bitmap.close()
      if (loadedRef.current) URL.revokeObjectURL(loadedRef.current.url)
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    }
  }, [])

  const runExtraction = useCallback(
    async (image: LoadedImage, area: ContentRect, regionMap: RegionMap, runId: number) => {
      setPhase('processing')
      setResults({})
      setProgress(null)
      setDirty(false)
      setElapsed(null)
      setMessage('Preparing…')
      const started = performance.now()

      try {
        const next: ResultMap = {}
        for (let index = 0; index < FIELDS.length; index++) {
          if (runId !== runIdRef.current) return
          const field = FIELDS[index]
          setMessage(`Reading ${field.label.toLowerCase()}… (${index + 1}/${FIELDS.length})`)
          const result = await extractField(image.bitmap, area, regionMap[field.id], field)
          if (runId !== runIdRef.current) return
          next[field.id] = result
          setResults({ ...next })
        }
        if (runId !== runIdRef.current) return
        const seconds = (performance.now() - started) / 1000
        setElapsed(seconds)
        setPhase('done')
        setMessage('Done')
        setProgress(null)
      } catch (error) {
        if (runId !== runIdRef.current) return
        console.error(error)
        setPhase('error')
        setMessage(error instanceof Error ? error.message : 'OCR failed')
        setProgress(null)
      }
    },
    [],
  )

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setPhase('error')
        setMessage('That file is not an image the browser can read.')
        return
      }

      const runId = ++runIdRef.current
      setPhase('decoding')
      setMessage('Reading image…')
      setProgress(null)
      setResults({})
      setElapsed(null)
      setDirty(false)

      let bitmap: ImageBitmap
      try {
        bitmap = await decodeImage(file)
      } catch {
        setPhase('error')
        setMessage('Could not decode this image. Try PNG, JPEG, WebP, or another browser-supported format.')
        return
      }

      if (runId !== runIdRef.current) {
        bitmap.close()
        return
      }

      const previous = loadedRef.current
      const url = URL.createObjectURL(file)
      const top = detectContentTop(bitmap.width, bitmap.height)
      const nextLoaded: LoadedImage = {
        file,
        bitmap,
        url,
        width: bitmap.width,
        height: bitmap.height,
        contentTop: top,
      }

      loadedRef.current = nextLoaded
      setLoaded(nextLoaded)
      setTopOffset(top)
      setCalibrating(false)

      if (previous) {
        URL.revokeObjectURL(previous.url)
        previous.bitmap.close()
      }

      const area = makeContentRect(bitmap.width, bitmap.height, top)
      const nextRegions = loadRegions(aspectLabel(area))
      setRegions(nextRegions)
      await runExtraction(nextLoaded, area, nextRegions, runId)
    },
    [runExtraction],
  )

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const items = event.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            event.preventDefault()
            void handleFile(file)
            return
          }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [handleFile])

  function updateRegion(id: FieldId, region: RegionRect) {
    const next = { ...regions, [id]: region }
    setRegions(next)
    setDirty(true)
    if (aspect) saveRegions(aspect, next)
  }

  function updateTopOffset(value: number) {
    setTopOffset(value)
    setDirty(true)
    if (loaded) loadedRef.current = { ...loaded, contentTop: value }
  }

  function resetRegionProfile() {
    const next = cloneRegions(DEFAULT_REGIONS)
    setRegions(next)
    setDirty(true)
    if (aspect) clearRegions(aspect)
  }

  function rerun() {
    if (!loaded || !content) return
    const runId = ++runIdRef.current
    void runExtraction(loaded, content, regions, runId)
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      copyFallback(text)
    }
    setCopied(label)
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    copyTimerRef.current = window.setTimeout(() => setCopied(null), 1800)
  }

  const allText = FIELDS.map(
    (field) => `${field.label}: ${results[field.id]?.value ?? ''}`,
  ).join('\n')

  const jsonText = JSON.stringify(
    {
      clock: results.clock?.value ?? '',
      jumpingIn: results.jump?.value ?? '',
      currentSystem: results.system?.value ?? '',
      waypoint: results.waypoint?.value ?? '',
    },
    null,
    2,
  )

  const hasAnyResult = FIELDS.some((field) => results[field.id]?.value)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand__mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" />
              <path d="M12 7v10M7 12h10" />
            </svg>
          </div>
          <div>
            <h1>Elite Screenshot OCR</h1>
            <p>Clock · jump timer · current system · waypoint</p>
          </div>
        </div>
        <div className="topbar__actions">
          {loaded && (
            <>
              <input
                ref={newInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void handleFile(file)
                  event.target.value = ''
                }}
              />
              <button
                type="button"
                className="button button--ghost"
                onClick={() => newInputRef.current?.click()}
              >
                New image
              </button>
            </>
          )}
          <span className="local-badge">
            <span className="local-badge__dot" />
            Runs locally
          </span>
        </div>
      </header>

      {!loaded ? (
        <main className="landing">
          <DropZone onFile={handleFile} disabled={phase === 'decoding'} />
          {phase === 'decoding' && (
            <div className="status status--standalone">
              <span className="spinner" />
              {message}
            </div>
          )}
          {phase === 'error' && (
            <div className="status status--error" role="alert">
              {message}
            </div>
          )}
          <div className="landing__notes">
            <div>
              <strong>Paste straight from the clipboard.</strong> Screenshot the game, press Ctrl+V, and the four
              values are read in your browser.
            </div>
            <div>
              <strong>Nothing is uploaded.</strong> Only the Tesseract OCR engine is fetched from a CDN; the image
              stays on this device.
            </div>
          </div>
        </main>
      ) : (
        <main className="workspace">
          <section className="preview-panel">
            <div className="panel-head">
              <h2>Source image</h2>
              <span className="mono muted">
                {loaded.width} × {loaded.height}
              </span>
            </div>
            {content && (
              <RegionOverlay
                imageUrl={loaded.url}
                imageWidth={loaded.width}
                imageHeight={loaded.height}
                content={content}
                regions={regions}
                calibrating={calibrating}
                onChange={updateRegion}
              />
            )}
            <div className="preview-controls">
              <button
                type="button"
                className={`button ${calibrating ? 'button--active' : 'button--ghost'}`}
                onClick={() => setCalibrating((value) => !value)}
              >
                {calibrating ? 'Finish adjusting' : 'Adjust regions'}
              </button>
              <button
                type="button"
                className={`button ${dirty ? 'button--primary' : 'button--ghost'}`}
                onClick={rerun}
                disabled={phase === 'processing'}
              >
                {phase === 'processing' ? 'Reading…' : 'Re-run OCR'}
              </button>
            </div>
            {calibrating && (
              <div className="calibration-panel">
                <label className="slider-row">
                  <span>Top offset</span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1, Math.round(loaded.height * 0.15))}
                    step={1}
                    value={topOffset}
                    onChange={(event) => updateTopOffset(Number(event.target.value))}
                  />
                  <span className="mono">{topOffset}px</span>
                </label>
                <p className="calibration-help">
                  Drag a box to move it, or drag its bottom-right corner to resize. Profiles are saved per aspect
                  ratio. Correct the top offset if the screenshot has a dark title bar or unusual window chrome.
                </p>
                <div className="calibration-actions">
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    onClick={() => updateTopOffset(detectContentTop(loaded.width, loaded.height))}
                  >
                    Auto top offset
                  </button>
                  <button type="button" className="button button--ghost button--small" onClick={resetRegionProfile}>
                    Reset regions to defaults
                  </button>
                </div>
              </div>
            )}
            {dirty && <div className="dirty-note">Regions changed — re-run OCR to refresh the values.</div>}
          </section>

          <aside className="results-panel">
            <div className="panel-head">
              <h2>Extracted values</h2>
              <span className={`phase-dot phase-dot--${phase}`} title={phase} />
            </div>

            <div className={`status status--${phase}`} role="status" aria-live="polite">
              {phase === 'processing' || phase === 'decoding' ? <span className="spinner" /> : null}
              <span>{message || 'Ready'}</span>
              {phase === 'done' && elapsed !== null ? (
                <span className="muted mono">{elapsed.toFixed(1)}s</span>
              ) : null}
            </div>
            {progress !== null && (
              <div className="progress">
                <div className="progress__bar" style={{ width: `${progress}%` }} />
              </div>
            )}

            <div className="result-list">
              {FIELDS.map((field) => (
                <ResultCard
                  key={field.id}
                  field={field}
                  result={results[field.id]}
                  pending={phase === 'processing'}
                  onChange={(value) => {
                    const current = results[field.id]
                    if (!current) return
                    setResults({
                      ...results,
                      [field.id]: { ...current, value, status: 'ok', note: 'Edited' },
                    })
                  }}
                  onCopy={(value) => void copyText(value, field.label)}
                />
              ))}
            </div>

            <div className="result-actions">
              <button
                type="button"
                className="button button--primary"
                onClick={() => void copyText(allText, 'all values')}
                disabled={!hasAnyResult}
              >
                Copy all
              </button>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => void copyText(jsonText, 'JSON')}
                disabled={!hasAnyResult}
              >
                Copy JSON
              </button>
            </div>
          </aside>
        </main>
      )}

      <footer className="footer">
        <span>Images stay on this device.</span>
        <span className="footer__meta">
          <span>Tesseract.js loaded from CDN · region profiles saved in local storage</span>
          <span className="footer__separator" aria-hidden="true">·</span>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            title="View source on GitHub"
          >
            GitHub
          </a>
          <span className="footer__separator" aria-hidden="true">·</span>
          <a
            className="mono"
            href={COMMIT_URL}
            target="_blank"
            rel="noreferrer noopener"
            title={`Commit ${COMMIT_SHA}`}
          >
            {SHORT_COMMIT}
          </a>
        </span>
      </footer>

      {copied && <div className="toast">Copied {copied}</div>}
    </div>
  )
}
