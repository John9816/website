import { useState } from 'react'
import { App as AntApp } from 'antd'
import { LoaderCircle, Share2 } from 'lucide-react'
import { createMusicShare } from '../api/music'
import { useMusicBrowse } from '../context/MusicPlayerContext'
import type { SongSearchItem } from '../types'
import { copyText } from '../utils/share'

type Props = {
  song: SongSearchItem
}

function sourceLabel(source: SongSearchItem['source']) {
  switch (source) {
    case 'qq':
      return 'QQ 音乐'
    case 'netease':
      return '网易云'
    case 'kuwo':
      return '酷我'
    case 'qishui':
      return '汽水音乐'
  }
}

function getSourceSongUrl(song: SongSearchItem) {
  const songId = encodeURIComponent(song.id)

  switch (song.source) {
    case 'qq':
      return `https://y.qq.com/n/ryqq/songDetail/${songId}`
    case 'netease':
      return `https://music.163.com/#/song?id=${songId}`
    case 'kuwo':
      return `https://www.kuwo.cn/play_detail/${songId}`
    case 'qishui':
      return ''
  }
}

function buildLegacyShareText(song: SongSearchItem) {
  const lines = [
    `分享歌曲：${song.name}`,
    `歌手：${song.artist || '未知歌手'}`,
    song.album ? `专辑：${song.album}` : '',
    `来源：${sourceLabel(song.source)}`,
    getSourceSongUrl(song) ? `链接：${getSourceSongUrl(song)}` : '',
  ].filter(Boolean)

  return lines.join('\n')
}

function isShareCanceled(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

export default function MusicShareAction({ song }: Props) {
  const { message } = AntApp.useApp()
  const { preferredQuality } = useMusicBrowse()
  const [busy, setBusy] = useState(false)

  const copyLegacyShare = async () => {
    await copyText(buildLegacyShareText(song))
    message.warning('公开分享暂不可用，已复制原平台歌曲信息')
  }

  const handleShare = async () => {
    if (busy) return
    setBusy(true)

    try {
      const requestedQuality = song.availableQualities.includes(preferredQuality)
        ? preferredQuality
        : song.availableQualities[0] || '320k'
      const share = await createMusicShare({
        source: song.source,
        songId: song.id,
        name: song.name,
        artist: song.artist || undefined,
        album: song.album,
        coverUrl: song.coverUrl,
        durationSec: song.durationSec ?? (song.durationMs ? Math.round(song.durationMs / 1000) : undefined),
        requestedQuality,
      })
      const shareUrl = `${window.location.origin}/music/share/${encodeURIComponent(share.token)}`
      const shareText = `${song.name}-${song.artist || '未知歌手'}，无需登录点开即听`

      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: song.name, text: shareText, url: shareUrl })
          message.success('分享成功')
          return
        } catch (error) {
          if (isShareCanceled(error)) return
          throw error
        }
      }

      await copyText(`${shareText}\n${shareUrl}`)
      message.success('公开链接已复制，无需登录点开即听')
    } catch {
      try {
        await copyLegacyShare()
      } catch {
        message.error('分享失败，请检查登录状态和浏览器权限')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className="music-icon-action"
      disabled={busy}
      aria-busy={busy}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void handleShare()
      }}
      aria-label={busy ? '正在创建公开分享' : '分享歌曲，无需登录点开即听'}
      title={busy ? '正在创建公开分享' : '分享歌曲，无需登录点开即听'}
    >
      {busy ? <LoaderCircle size={16} className="is-spinning" /> : <Share2 size={16} />}
    </button>
  )
}
