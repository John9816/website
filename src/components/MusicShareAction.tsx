import { App as AntApp } from 'antd'
import { Share2 } from 'lucide-react'
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
  }
}

function buildShareText(song: SongSearchItem) {
  const lines = [
    `分享歌曲：${song.name}`,
    `歌手：${song.artist || '未知歌手'}`,
    song.album ? `专辑：${song.album}` : '',
    `来源：${sourceLabel(song.source)}`,
    `链接：${getSourceSongUrl(song)}`,
  ].filter(Boolean)

  return lines.join('\n')
}

export default function MusicShareAction({ song }: Props) {
  const { message } = AntApp.useApp()

  const handleShare = async () => {
    try {
      await copyText(buildShareText(song))
      message.success('歌曲分享信息已复制')
    } catch {
      message.error('复制失败，请检查浏览器权限')
    }
  }

  return (
    <button
      type="button"
      className="music-icon-action"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void handleShare()
      }}
      aria-label="复制歌曲分享信息"
      title="复制歌曲分享信息"
    >
      <Share2 size={16} />
    </button>
  )
}
