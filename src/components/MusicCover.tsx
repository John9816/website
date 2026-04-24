import { useState } from 'react'
import { Music2 } from 'lucide-react'
import { normalizeCoverUrl } from '../utils/musicPlayer'

type MusicCoverProps = {
  src?: string
  size: number
  rounded?: number
}

export default function MusicCover({
  src,
  size,
  rounded = 6,
}: MusicCoverProps) {
  const [failed, setFailed] = useState(false)
  const url = normalizeCoverUrl(src)

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
