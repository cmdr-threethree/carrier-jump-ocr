import { useRef } from 'react'
import { FIELDS } from '../lib/constants'
import type { ContentRect, FieldId, RegionRect } from '../lib/types'

interface RegionOverlayProps {
  imageUrl: string
  imageWidth: number
  imageHeight: number
  content: ContentRect
  regions: Record<FieldId, RegionRect>
  calibrating: boolean
  onChange: (id: FieldId, region: RegionRect) => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export default function RegionOverlay({
  imageUrl,
  imageWidth,
  imageHeight,
  content,
  regions,
  calibrating,
  onChange,
}: RegionOverlayProps) {
  const frameRef = useRef<HTMLDivElement>(null)

  function startDrag(
    event: React.PointerEvent<HTMLElement>,
    id: FieldId,
    mode: 'move' | 'resize',
  ) {
    if (!calibrating) return
    event.preventDefault()
    event.stopPropagation()

    const frame = frameRef.current
    if (!frame) return
    const bounds = frame.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return

    const start = { ...regions[id] }
    const startX = event.clientX
    const startY = event.clientY
    const perPixelX = imageWidth / content.width / bounds.width
    const perPixelY = imageHeight / content.height / bounds.height

    function onMove(moveEvent: PointerEvent) {
      const dx = (moveEvent.clientX - startX) * perPixelX
      const dy = (moveEvent.clientY - startY) * perPixelY

      if (mode === 'move') {
        onChange(id, {
          ...start,
          x: clamp(start.x + dx, 0, 1 - start.w),
          y: clamp(start.y + dy, 0, 1 - start.h),
        })
      } else {
        onChange(id, {
          ...start,
          w: clamp(start.w + dx, 0.01, 1 - start.x),
          h: clamp(start.h + dy, 0.01, 1 - start.y),
        })
      }
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  return (
    <div className={`preview-frame${calibrating ? ' is-calibrating' : ''}`} ref={frameRef}>
      <img src={imageUrl} alt="Uploaded screenshot" draggable={false} />
      {FIELDS.map((field, index) => {
        const region = regions[field.id]
        const left = ((content.x + region.x * content.width) / imageWidth) * 100
        const top = ((content.y + region.y * content.height) / imageHeight) * 100
        const width = ((region.w * content.width) / imageWidth) * 100
        const height = ((region.h * content.height) / imageHeight) * 100

        return (
          <div
            key={field.id}
            className={`region-box region-box--${index}`}
            style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
            onPointerDown={(event) => startDrag(event, field.id, 'move')}
            title={`${field.label} region`}
          >
            <span className="region-box__label">{field.shortLabel}</span>
            {calibrating && (
              <span
                className="region-box__handle"
                onPointerDown={(event) => startDrag(event, field.id, 'resize')}
                aria-hidden="true"
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
