import { useEffect, useState, type CSSProperties } from 'react'
import { FastAverageColor } from 'fast-average-color'
import { useMusicBrowse } from '../context/MusicPlayerContext'
import { coverUrlForSize } from '../utils/musicPlayer'

const fac = new FastAverageColor()
const DEFAULT_RGB = '198, 176, 152'

/**
 * 音乐页液体背景。
 *
 * 只做一层纯 CSS 驱动的色斑：4 个用 transform 做缓慢漂移的柔和色块，
 * 颜色取自当前播放封面的主色。不使用 backdrop-filter / 全屏 SVG 滤镜，
 * 关闭动效或关闭液体背景时退化为纯色底，几乎零成本。
 */
export default function MusicLiquidBackdrop() {
  const { current } = useMusicBrowse()
  // A 100px thumbnail is plenty for dominant-colour extraction and ~40x smaller
  // than the original cover. The CDN has no ACAO header, so this still falls back
  // to DEFAULT_RGB — but the wasted download shrinks from ~500KB to ~4KB.
  const coverUrl = coverUrlForSize(current?.coverUrl, 48)
  const [rgb, setRgb] = useState(DEFAULT_RGB)

  useEffect(() => {
    if (!coverUrl) {
      setRgb(DEFAULT_RGB)
      return
    }
    let active = true
    fac
      .getColorAsync(coverUrl, {
        algorithm: 'dominant',
        crossOrigin: 'anonymous',
      })
      .then((color) => {
        if (active) setRgb(color.value.slice(0, 3).join(', '))
      })
      .catch(() => {
        if (active) setRgb(DEFAULT_RGB)
      })
    return () => {
      active = false
    }
  }, [coverUrl])

  return (
    <div
      className="music-liquid-backdrop"
      style={{ '--music-liquid-rgb': rgb } as CSSProperties}
      aria-hidden="true"
    >
      <span className="music-liquid-backdrop__blob music-liquid-backdrop__blob--a" />
      <span className="music-liquid-backdrop__blob music-liquid-backdrop__blob--b" />
      <span className="music-liquid-backdrop__blob music-liquid-backdrop__blob--c" />
      <span className="music-liquid-backdrop__blob music-liquid-backdrop__blob--d" />
      <span className="music-liquid-backdrop__veil" />
    </div>
  )
}
