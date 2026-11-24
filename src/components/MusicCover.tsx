import { useEffect, useState } from 'react'
import { Music2 } from 'lucide-react'
import { coverUrlForSize, normalizeCoverUrl } from '../utils/musicPlayer'

type MusicCoverProps = {
  src?: string
  size: number
  rounded?: number
  loading?: 'lazy' | 'eager'
  className?: string
  crossOrigin?: 'anonymous' | 'use-credentials'
}

export default function MusicCover({
  src,
  size,
  rounded = 6,
  loading = 'lazy',
  className,
  crossOrigin,
}: MusicCoverProps) {
  // Two-level fallback: the sized CDN thumbnail first, then the full webp
  // original if a template is ever rejected, then the placeholder.
  const [stage, setStage] = useState<'thumb' | 'original' | 'failed'>('thumb')
  const thumb = coverUrlForSize(src, size)
  const original = normalizeCoverUrl(src)
  const url = stage === 'failed'
    ? undefined
    : stage === 'original'
      ? original
      : (thumb ?? original)

  useEffect(() => {
    setStage('thumb')
  }, [src])

  if (!url) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: rounded,
          background: 'var(--panel-alt)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-dim)',
          flexShrink: 0,
        }}
      >
        <Music2 size={Math.round(size * 0.42)} />
      </div>
    )
  }

  return (
    <img
      src={url}
      alt=""
      loading={loading}
      decoding="async"
      referrerPolicy="no-referrer"
      crossOrigin={crossOrigin}
      className={className}
      onError={() => {
        // Only retry once with the original; avoid an infinite loop when both fail.
        if (stage === 'thumb' && original && original !== url) setStage('original')
        else setStage('failed')
      }}
      style={{
        width: size,
        height: size,
        borderRadius: rounded,
        objectFit: 'cover',
        flexShrink: 0,
      }}
    />
  )
}
