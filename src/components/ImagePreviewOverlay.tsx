import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { normalizeRemoteImageUrl } from '../utils/remoteImage'

interface ImagePreviewOverlayProps {
  src: string
  alt?: string
  onClose: () => void
}

interface ImageMeta {
  width: number
  height: number
}

export default function ImagePreviewOverlay({
  src,
  alt = 'preview',
  onClose,
}: ImagePreviewOverlayProps) {
  const [meta, setMeta] = useState<ImageMeta | null>(null)
  const normalizedSrc = normalizeRemoteImageUrl(src, { requireUsableAssetPath: true }) || src

  useEffect(() => {
    let active = true
    const img = new window.Image()
    img.onload = () => {
      if (!active) return
      setMeta({
        width: img.naturalWidth,
        height: img.naturalHeight,
      })
    }
    img.src = normalizedSrc
    return () => {
      active = false
    }
  }, [normalizedSrc])

  return (
    <div className="admin-image__preview-overlay" onClick={onClose}>
      <button
        type="button"
        className="admin-image__preview-close"
        onClick={onClose}
      >
        <X size={20} />
      </button>

      <div className="admin-image__preview-stage">
        <div
          className="admin-image__preview-content"
          onClick={(event) => event.stopPropagation()}
        >
          <img src={normalizedSrc} alt={alt} className="admin-image__preview-img" />
          {meta && (
            <div className="admin-image__preview-meta">
              原始比例 {meta.width} x {meta.height}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
