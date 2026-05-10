import { useEffect, useMemo, useRef, useState } from 'react'
import {
  App as AntApp,
  Button,
  Card,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Typography,
} from 'antd'
import { Copy, RotateCw, Share2 } from 'lucide-react'
import {
  deleteMusicShare,
  getMusicShareStatus,
  saveMusicShare,
} from '../api/music'
import { useAuth } from '../context/AuthContext'
import type { MusicQuality, MusicShareView, SongSearchItem } from '../types'
import { copyText, formatDateTime, toDatetimeLocalValue } from '../utils/share'
import MusicCover from './MusicCover'

const QUALITY_OPTIONS: Array<{ value: MusicQuality; label: string }> = [
  { value: '128k', label: '128K' },
  { value: '320k', label: '320K' },
  { value: 'flac', label: 'FLAC' },
  { value: 'flac24bit', label: 'Hi-Res' },
]

type Props = {
  song: SongSearchItem
  shared?: boolean
  loading?: boolean
  initialShare?: MusicShareView | null
  onChange?: (share: MusicShareView | null) => void
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

export default function MusicShareAction({
  song,
  shared = false,
  loading = false,
  initialShare = null,
  onChange,
}: Props) {
  const { message } = AntApp.useApp()
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const [shareInfo, setShareInfo] = useState<MusicShareView | null>(initialShare)
  const [requestedQuality, setRequestedQuality] = useState<MusicQuality>(
    initialShare?.requestedQuality ?? 'flac',
  )
  const [expiresAt, setExpiresAt] = useState(toDatetimeLocalValue(initialShare?.expiresAt))
  const [statusLoading, setStatusLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const latestInitialShareRef = useRef(initialShare)
  const latestOnChangeRef = useRef(onChange)

  useEffect(() => {
    latestInitialShareRef.current = initialShare
  }, [initialShare])

  useEffect(() => {
    latestOnChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setStatusLoading(true)

    getMusicShareStatus(song.source, song.id)
      .then((status) => {
        if (cancelled) return
        const fallbackShare = latestInitialShareRef.current
        setShareInfo(status)
        setRequestedQuality(status?.requestedQuality ?? fallbackShare?.requestedQuality ?? 'flac')
        setExpiresAt(toDatetimeLocalValue(status?.expiresAt ?? fallbackShare?.expiresAt))
        latestOnChangeRef.current?.(status)
      })
      .catch((error) => {
        if (cancelled) return
        message.error((error as Error).message)
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [message, open, song.id, song.source])

  const shareUrl = useMemo(() => {
    if (!shareInfo?.token) return ''
    return new URL(`/music/share/${shareInfo.token}`, window.location.origin).toString()
  }, [shareInfo?.token])

  const handleOpen = () => {
    if (!auth.token) {
      message.info('登录后可分享歌曲')
      return
    }
    setShareInfo(initialShare)
    setRequestedQuality(initialShare?.requestedQuality ?? 'flac')
    setExpiresAt(toDatetimeLocalValue(initialShare?.expiresAt))
    setOpen(true)
  }

  const handleCopy = async (text: string, successText: string) => {
    if (!text) return
    try {
      await copyText(text)
      message.success(successText)
    } catch {
      message.error('复制失败，请检查浏览器权限')
    }
  }

  const handleSaveShare = async (rotateToken = false) => {
    setSaving(true)
    try {
      const saved = await saveMusicShare({
        source: song.source,
        songId: song.id,
        name: song.name,
        artist: song.artist,
        album: song.album,
        coverUrl: song.coverUrl,
        durationSec: song.durationSec,
        requestedQuality,
        expiresAt: expiresAt || null,
        rotateToken,
      })
      setShareInfo(saved)
      setRequestedQuality(saved.requestedQuality)
      setExpiresAt(toDatetimeLocalValue(saved.expiresAt))
      onChange?.(saved)
      message.success(rotateToken ? '分享链接已轮换' : '分享设置已保存')
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteShare = async () => {
    setSaving(true)
    try {
      await deleteMusicShare(song.source, song.id)
      setShareInfo(null)
      onChange?.(null)
      message.success('歌曲分享已关闭')
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={`music-icon-action${shared ? ' is-active' : ''}`}
        disabled={loading}
        onClick={(event) => {
          event.stopPropagation()
          handleOpen()
        }}
        aria-label={shared ? '管理分享' : '分享歌曲'}
        title={shared ? '管理分享' : '分享歌曲'}
      >
        <Share2 size={16} />
      </button>

      <Modal
        title={`分享歌曲 · ${song.name}`}
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        destroyOnClose
      >
        {statusLoading ? (
          <Typography.Text type="secondary">正在读取分享状态...</Typography.Text>
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              公开链接会走当前前端路由 `/music/share/:token`，页面内部再请求后端公开接口。
            </Typography.Paragraph>

            <div className="music-share-dialog__song">
              <MusicCover src={song.coverUrl} size={68} rounded={22} />
              <div className="music-share-dialog__song-copy">
                <strong title={song.name}>{song.name}</strong>
                <span title={song.artist}>{song.artist || '未知歌手'}</span>
                <span>
                  {sourceLabel(song.source)}
                  {song.album ? ` · ${song.album}` : ''}
                </span>
              </div>
            </div>

            <div className="music-share-dialog__fields">
              <label className="music-share-dialog__field">
                <span>优先音质</span>
                <Select
                  value={requestedQuality}
                  options={QUALITY_OPTIONS}
                  onChange={(value) => setRequestedQuality(value)}
                />
              </label>

              <label className="music-share-dialog__field">
                <span>过期时间</span>
                <Input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                />
              </label>
            </div>

            {shareInfo ? (
              <>
                <Card size="small">
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <div className="music-share-dialog__meta-row">
                      <Typography.Text type="secondary">Token</Typography.Text>
                      <Typography.Text code>{shareInfo.token}</Typography.Text>
                    </div>
                    <div className="music-share-dialog__meta-row">
                      <Typography.Text type="secondary">访问量</Typography.Text>
                      <Typography.Text>{shareInfo.viewCount}</Typography.Text>
                    </div>
                    <div className="music-share-dialog__meta-row">
                      <Typography.Text type="secondary">最近更新</Typography.Text>
                      <Typography.Text>{formatDateTime(shareInfo.updatedAt)}</Typography.Text>
                    </div>
                    <div className="music-share-dialog__meta-row">
                      <Typography.Text type="secondary">过期时间</Typography.Text>
                      <Typography.Text>{formatDateTime(shareInfo.expiresAt)}</Typography.Text>
                    </div>
                    <Input value={shareUrl} readOnly />
                  </Space>
                </Card>

                <Space wrap>
                  <Button type="primary" loading={saving} onClick={() => void handleSaveShare(false)}>
                    保存分享设置
                  </Button>
                  <Button
                    icon={<RotateCw size={14} />}
                    loading={saving}
                    onClick={() => void handleSaveShare(true)}
                  >
                    轮换链接
                  </Button>
                  <Button
                    icon={<Copy size={14} />}
                    onClick={() => void handleCopy(shareUrl, '公开链接已复制')}
                  >
                    复制公开链接
                  </Button>
                  <Button
                    icon={<Copy size={14} />}
                    onClick={() => void handleCopy(shareInfo.token, '分享 Token 已复制')}
                  >
                    复制 Token
                  </Button>
                  <Popconfirm title="确定关闭当前歌曲分享吗？" onConfirm={() => void handleDeleteShare()}>
                    <Button danger loading={saving}>
                      关闭分享
                    </Button>
                  </Popconfirm>
                </Space>
              </>
            ) : (
              <Button type="primary" loading={saving} onClick={() => void handleSaveShare(false)}>
                启用公开分享
              </Button>
            )}
          </Space>
        )}
      </Modal>
    </>
  )
}
