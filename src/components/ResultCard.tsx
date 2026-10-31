import type { FieldDef, FieldResult } from '../lib/types'

interface ResultCardProps {
  field: FieldDef
  result?: FieldResult
  pending: boolean
  onChange: (value: string) => void
  onCopy: (value: string) => void
}

export default function ResultCard({
  field,
  result,
  pending,
  onChange,
  onCopy,
}: ResultCardProps) {
  const needsReview = result ? result.status === 'review' : false

  return (
    <section className={`result-card${needsReview ? ' result-card--review' : ''}`}>
      <div className="result-card__head">
        <div>
          <div className="result-card__label">{field.label}</div>
          <div className="result-card__sub">
            {result ? (
              <>
                <span className={`pill ${needsReview ? 'pill--review' : 'pill--ok'}`}>
                  {needsReview ? 'Review' : 'Ready'}
                </span>
                <span className="result-card__confidence">{result.confidence}% confidence</span>
              </>
            ) : (
              <span className="muted">{pending ? 'Reading…' : 'Waiting'}</span>
            )}
          </div>
        </div>
        {result && (
          <button
            type="button"
            className="icon-button"
            title={`Copy ${field.label}`}
            onClick={() => onCopy(result.value)}
            disabled={!result.value}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
            </svg>
          </button>
        )}
      </div>

      {result ? (
        <>
          <input
            className={`value-input${needsReview ? ' value-input--review' : ''}`}
            value={result.value}
            spellCheck={false}
            autoComplete="off"
            aria-label={field.label}
            onChange={(event) => onChange(event.target.value)}
          />
          {result.note && <div className="result-card__note">{result.note}</div>}
          {result.raw && result.raw.trim() !== result.value.trim() && (
            <div className="result-card__raw" title={result.raw}>
              raw: {result.raw.replace(/\n/g, ' ')}
            </div>
          )}
          {result.cropUrl && (
            <img className="crop-preview" src={result.cropUrl} alt={`${field.label} OCR crop`} />
          )}
        </>
      ) : (
        <div className="value-skeleton" aria-hidden="true" />
      )}
    </section>
  )
}
