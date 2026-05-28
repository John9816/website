import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { App as AntApp, Button, Input, Modal, Popconfirm, Tag, Tooltip } from 'antd'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Edit2, Heart, Play, RefreshCcw, Trash2 } from 'lucide-react'
import { DEFAULT_PAGE_SIZE } from '../constants/pagination'
import { useAuth } from '../context/AuthContext'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import { useMusicFavorites } from '../hooks/useMusicFavorites'
import type { ImportedPlaylist, ImportedPlaylistItem, MusicQuality, MusicSourceId, SongSearchItem } from '../types'
import { getImportedPlaylistDetail, removePlaylistItem, updateImportedPlaylist, deleteImportedPlaylist } from '../api/music'
import MusicCover from '../components/MusicCover'
import MusicShareAction from '../components/MusicShareAction'
import MusicSongTable from '../components/MusicSongTable'
import { normalizeCoverUrl } from '../utils/musicPlayer'

const ALL_QUALITIES: MusicQuality[] = ['128k', '320k', 'flac', 'flac24bit']
const FULL_PLAY_FETCH_SIZE = 100

function sourceLabel(source: MusicSourceId) {
  switch (source) {
    case 'qq':
      return 'QQ 音乐'
    case 'netease':
      return '网易云'
    case 'kuwo':
      return '酷我'
    default:
      return source
  }
}

function toSongSearchItem(item: ImportedPlaylistItem): SongSearchItem {
  return {
    id: item.songId,
    source: item.source,
    name: item.name,
    artist: item.artist ?? '',
    album: item.album ?? undefined,
    coverUrl: item.coverUrl ?? undefined,
    durationSec: item.durationSec ?? undefined,
    availableQualities: ALL_QUALITIES,
  }
}

function itemSongKey(item: Pick<ImportedPlaylistItem, 'source' | 'songId'>) {
  return `${item.source}:${item.songId}`
}

function songKey(song: Pick<SongSearchItem, 'source' | 'id'>) {
  return `${song.source}:${song.id}`
}

function extractImportedPlaylistItems(data: unknown) {
  const rawData = (data as any).data || data
  let listData = (data as any).items || rawData.items || (data as any).list || rawData.list || []

  if (!Array.isArray(listData)) {
    if (listData && Array.isArray((listData as any).items)) {
      listData = (listData as any).items
    } else {
      console.error('Expected array for playlist items, got:', listData)
      listData = []
    }
  }

  return {
    rawData,
    playlistData:
      (data as any).playlist || rawData.playlist || (data !== rawData ? rawData : null),
    listData: listData as ImportedPlaylistItem[],
  }
}

export default function MusicMyPlaylistDetailPage() {
  const { message, modal } = AntApp.useApp()
  const auth = useAuth()
  const navigate = useNavigate()
  const params = useParams()
  const { setPlaylist, playPlaylist } = useMusicPlayer()

  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [playlist, setPlaylistState] = useState<ImportedPlaylist | null>(null)
  const [items, setItems] = useState<ImportedPlaylistItem[]>([])
  const [total, setTotal] = useState(0)
  const [removingItemId, setRemovingItemId] = useState<number | null>(null)

  const [renameModalVisible, setRenameModalVisible] = useState(false)
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [playingAll, setPlayingAll] = useState(false)

  const requestIdRef = useRef(0)

  const playlistId = params.id ? Number(params.id) : null
  const songs = useMemo(() => (Array.isArray(items) ? items.map(toSongSearchItem) : []), [items])
  const favoriteState = useMusicFavorites(songs)

  const loadDetail = useCallback(async () => {
    if (!playlistId || Number.isNaN(playlistId)) return
    const requestId = ++requestIdRef.current
    setLoading(true)
    try {
      const data = await getImportedPlaylistDetail(playlistId, page - 1, pageSize)
      if (requestId !== requestIdRef.current) return

      // 更加鲁棒的数据解析
      const rawData = (data as any).data || data
      const playlistData = (data as any).playlist || rawData.playlist || (data !== rawData ? rawData : null)
      
      if (playlistData && playlistData.name) {
        setPlaylistState(playlistData)
      } else if (!playlist) {
        setPlaylistState({
          id: playlistId,
          source: 'qq',
          externalId: String(playlistId),
          name: '我的歌单',
        })
      }

      let listData = (data as any).items || rawData.items || (data as any).list || rawData.list || []
      if (!Array.isArray(listData)) {
        // 如果提取出来的还是一个包含 items 的对象（如错误日志所示）
        if (listData && Array.isArray((listData as any).items)) {
          listData = (listData as any).items
        } else {
          console.error('Expected array for playlist items, got:', listData)
          listData = []
        }
      }
      
      const songList = listData.map(toSongSearchItem)
      const fallbackTrackCount =
        typeof playlistData?.trackCount === 'number'
          ? playlistData.trackCount
          : typeof playlist?.trackCount === 'number'
            ? playlist.trackCount
            : null
      
      // 先计算好再更新状态，避免中间态导致渲染崩溃
      setItems(listData)
      const totalCount =
        typeof (data as any).total === 'number'
          ? (data as any).total
          : typeof rawData.total === 'number'
            ? rawData.total
            : (fallbackTrackCount ?? listData.length)
      setTotal(totalCount)
      setPlaylist(songList)
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      message.error((error as Error).message)
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }, [playlistId, page, pageSize, setPlaylist, message])

  const handlePlayEntirePlaylist = useCallback(async () => {
    if (!playlistId || Number.isNaN(playlistId)) return
    if (!total && !songs.length) return

    setPlayingAll(true)
    try {
      const allItems: ImportedPlaylistItem[] = []
      let nextPage = 0
      let knownTotal =
        typeof playlist?.trackCount === 'number' && playlist.trackCount > 0
          ? playlist.trackCount
          : total

      while (true) {
        const data = await getImportedPlaylistDetail(playlistId, nextPage, FULL_PLAY_FETCH_SIZE)
        const { rawData, playlistData, listData } = extractImportedPlaylistItems(data)
        const pageTotal =
          typeof (data as any).total === 'number'
            ? (data as any).total
            : typeof rawData.total === 'number'
              ? rawData.total
              : typeof playlistData?.trackCount === 'number'
                ? playlistData.trackCount
                : knownTotal

        if (playlistData && playlistData.name) {
          setPlaylistState(playlistData)
        }
        if (!listData.length) break

        allItems.push(...listData)
        knownTotal = pageTotal

        const reachedTotal = typeof knownTotal === 'number' && allItems.length >= knownTotal
        const reachedLastPage =
          listData.length < FULL_PLAY_FETCH_SIZE &&
          (typeof knownTotal !== 'number' || knownTotal <= allItems.length)
        if (reachedTotal || reachedLastPage) break

        nextPage += 1
      }

      const allSongs = allItems.map(toSongSearchItem)
      if (!allSongs.length) {
        message.warning('这个歌单里还没有歌曲')
        return
      }

      await playPlaylist(allSongs)
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setPlayingAll(false)
    }
  }, [message, playPlaylist, playlist?.trackCount, playlistId, songs.length, total])

  const handleRename = useCallback(async () => {
    if (!playlistId || !newName.trim()) return
    setRenaming(true)
    try {
      const updated = await updateImportedPlaylist(playlistId, { name: newName.trim() })
      setPlaylistState(updated)
      setRenameModalVisible(false)
      setNewName('')
      message.success('重命名成功')
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setRenaming(false)
    }
  }, [playlistId, newName, message])

  const handleDeletePlaylist = useCallback(async () => {
    if (!playlistId) return
    setDeleting(true)
    try {
      await deleteImportedPlaylist(playlistId)
      message.success('删除成功')
      navigate('/music?view=my-playlists')
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setDeleting(false)
    }
  }, [playlistId, message, navigate])

  const handleRemoveItem = useCallback(async (song: SongSearchItem) => {
    if (!playlistId) return
    const target = items.find((item) => itemSongKey(item) === songKey(song))
    if (!target) return

    setRemovingItemId(target.id)
    try {
      await removePlaylistItem(playlistId, target.id)
      message.success('已从歌单中移除')
      if (items.length === 1 && page > 1) {
        setPage((prev) => Math.max(1, prev - 1))
      } else {
        setItems((prev) => prev.filter((item) => item.id !== target.id))
        setTotal((prev) => Math.max(0, prev - 1))
      }
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setRemovingItemId(null)
    }
  }, [playlistId, items, page, message])

  useEffect(() => {
    if (auth.token) void loadDetail()
  }, [auth.token, loadDetail])

  if (!auth.token) {
    return (
      <div className="music-detail-shell">
        <div className="music-empty-state">登录后才能查看我的歌单</div>
      </div>
    )
  }

  const heroCoverUrl = normalizeCoverUrl(playlist?.coverUrl ?? undefined)
  const heroStyle = heroCoverUrl
    ? ({
        ['--music-detail-cover' as string]: `url(${JSON.stringify(heroCoverUrl)})`,
      } as CSSProperties)
    : undefined

  const renderSongActions = (song: SongSearchItem) => (
    <>
      <button
        type="button"
        className={`music-icon-action${favoriteState.isFavorite(song) ? ' is-active' : ''}`}
        disabled={favoriteState.isFavoriteLoading(song)}
        onClick={(event) => {
          event.stopPropagation()
          void favoriteState.toggleFavorite(song)
        }}
        aria-label={favoriteState.isFavorite(song) ? '取消喜欢' : '加入喜欢'}
        title={favoriteState.isFavorite(song) ? '取消喜欢' : '加入喜欢'}
      >
        <Heart
          size={16}
          fill={favoriteState.isFavorite(song) ? 'currentColor' : 'none'}
        />
      </button>
      <MusicShareAction song={song} />
      <Popconfirm title="确定要从歌单中移除这首歌吗？" onConfirm={() => void handleRemoveItem(song)}>
        <button
          type="button"
          className="music-icon-action is-danger"
          disabled={
            removingItemId ===
            items.find((item) => itemSongKey(item) === songKey(song))?.id
          }
          onClick={(event) => event.stopPropagation()}
          aria-label="移除"
          title="移除"
        >
          <Trash2 size={16} />
        </button>
      </Popconfirm>
    </>
  )

  if (!playlistId || Number.isNaN(playlistId)) {
    return (
      <div className="music-detail-shell">
        <div className="music-empty-state">歌单参数无效</div>
      </div>
    )
  }

  return (
    <div className="music-detail-shell">
      <div
        className={`music-detail-hero${heroCoverUrl ? ' music-detail-hero--with-cover' : ''}`}
        style={heroStyle}
      >
        <Link
          to="/music?view=my-playlists"
          className="music-hero-back"
          title="返回我的歌单"
        >
          <ArrowLeft size={20} />
        </Link>

        <MusicCover
          src={playlist?.coverUrl ?? undefined}
          size={148}
          rounded={32}
          loading="eager"
        />
        <div className="music-detail-hero__copy">
          <span className="music-stage-kicker">我的歌单</span>
          <h2>{playlist?.name || (loading ? '加载中...' : '我的歌单')}</h2>
          {playlist?.description && (
            <p>{playlist.description}</p>
          )}
          <div className="music-detail-meta">
            {playlist?.creatorName && (
              <span>
                <Tag color="blue">{sourceLabel(playlist.source)}</Tag>
                <span style={{ marginLeft: 8 }}>{playlist.creatorName}</span>
              </span>
            )}
            {total > 0 && <span>{total} 首歌曲</span>}
          </div>

          <div className="music-hero-actions">
            <Button
              type="primary"
              size="large"
              icon={<Play size={16} fill="currentColor" />}
              disabled={!total && !songs.length}
              loading={playingAll}
              onClick={() => {
                void handlePlayEntirePlaylist()
              }}
              className="music-hero-play-btn"
            >
              全部播放
            </Button>
            <Button
              ghost
              size="large"
              icon={<Play size={16} />}
              disabled={!songs.length || playingAll}
              onClick={() => {
                if (!songs.length) return
                void playPlaylist(songs)
              }}
              style={{
                height: 48,
                padding: '0 24px',
                borderRadius: 16,
                background: 'rgba(255, 255, 255, 0.1)',
                borderColor: 'rgba(255, 255, 255, 0.2)',
                color: '#fff',
              }}
            >
              播放本页
            </Button>
            <Button
              ghost
              size="large"
              icon={<RefreshCcw size={16} />}
              onClick={() => void loadDetail()}
              loading={loading}
              disabled={playingAll}
              className="music-hero-refresh-btn"
            >
              刷新
            </Button>
            <Tooltip title="重命名">
              <Button
                ghost
                size="large"
                icon={<Edit2 size={16} />}
                onClick={() => {
                  setNewName(playlist?.name || '')
                  setRenameModalVisible(true)
                }}
                style={{
                  height: 48,
                  width: 48,
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 16,
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderColor: 'rgba(255, 255, 255, 0.2)',
                  color: '#fff',
                }}
              />
            </Tooltip>
            <Popconfirm
              title="删除歌单"
              description="删除后歌单中的歌曲也会被移除，确定要删除吗？"
              onConfirm={() =>
                modal.confirm({
                  title: '二次确认',
                  content: '删除后不可恢复，确定要继续吗？',
                  onOk: () => void handleDeletePlaylist(),
                  okText: '删除',
                  okButtonProps: { danger: true, loading: deleting },
                })
              }
            >
              <Tooltip title="删除">
                <Button
                  ghost
                  size="large"
                  danger
                  icon={<Trash2 size={16} />}
                  style={{
                    height: 48,
                    width: 48,
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 16,
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                  }}
                />
              </Tooltip>
            </Popconfirm>
          </div>
        </div>
      </div>

      <div className="music-detail-list-head">
        <div className="music-detail-list-copy">
          <h3>歌曲列表</h3>
          <p>{total ? `共 ${total} 首` : '暂无歌曲'}</p>
        </div>
      </div>

      <MusicSongTable
        songs={songs}
        loading={loading}
        emptyText="这个歌单里还没有歌曲"
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(nextPage, nextPageSize) => {
          setPageSize(nextPageSize)
          setPage(nextPageSize !== pageSize ? 1 : nextPage)
        }}
        renderActions={renderSongActions}
        actionColumnWidth={248}
      />

      <Modal
        title="重命名"
        open={renameModalVisible}
        onCancel={() => setRenameModalVisible(false)}
        onOk={handleRename}
        confirmLoading={renaming}
        okText="保存"
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="请输入新名称"
          onPressEnter={handleRename}
          maxLength={200}
        />
      </Modal>
    </div>
  )
}
