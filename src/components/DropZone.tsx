import { useRef, useState } from 'react'

interface DropZoneProps {
  onFile: (file: File) => void
  compact?: boolean
  disabled?: boolean
}

export default function DropZone({ onFile, compact = false, disabled = false }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function chooseFile(file: File | undefined) {
    if (!file || disabled) return
    onFile(file)
  }

  return (
    <div
      className={`dropzone${compact ? ' dropzone--compact' : ''}${dragging ? ' is-dragging' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        chooseFile(event.dataTransfer.files?.[0])
      }}
      onClick={() => {
        if (!disabled) inputRef.current?.click()
      }}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && !disabled) {
          event.preventDefault()
          inputRef.current?.click()
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Choose or drop a screenshot"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          chooseFile(event.target.files?.[0])
          event.target.value = ''
        }}
      />
      <div className="dropzone__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M4 16.5V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5" />
          <path d="M12 3v12" />
          <path d="m7.5 7.5 4.5-4.5 4.5 4.5" />
        </svg>
      </div>
      <div className="dropzone__title">
        {compact ? 'Load another screenshot' : 'Drop a screenshot here'}
      </div>
      <div className="dropzone__hint">
        {compact ? 'or click to browse / paste with Ctrl+V' : 'Click to browse, drop a file, or paste with Ctrl+V'}
      </div>
      <div className="dropzone__formats">PNG · JPEG · WebP · AVIF · BMP</div>
    </div>
  )
}
