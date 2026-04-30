import { useEffect, useState } from 'react'
import { Music2 } from 'lucide-react'
import { normalizeCoverUrl } from '../utils/musicPlayer'

type MusicCoverProps = {
  src?: string
  size: number
  rounded?: number
  loading?: 'lazy' | 'eager'
}

export default function MusicCover({
  src,
  size,
  rounded = 6,
  loading = 'lazy',
}: MusicCoverProps) {
  const [failed, setFailed] = useState(false)
  const url = normalizeCoverUrl(src)

  useEffect(() => {
    setFailed(false)
  }, [url])

  if (!url || failed) {
    return (
      <div
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
      onError={() => setFailed(true)}
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
