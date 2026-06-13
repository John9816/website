import { Empty, Pagination, Space, Table, Typography } from 'antd'
import { useCallback, useMemo, type ReactNode } from 'react'
import { Pause, Play } from 'lucide-react'
import { PAGE_SIZE_OPTIONS } from '../constants/pagination'
import MusicCover from './MusicCover'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import type { SongSearchItem } from '../types'
import { formatDuration } from '../utils/musicPlayer'

type Props = {
  songs: SongSearchItem[]
  loading: boolean
  emptyText: string
  page: number
  pageSize: number
  total?: number | null
  onPageChange?: (nextPage: number, nextPageSize: number) => void
  renderActions?: (row: SongSearchItem) => ReactNode
  actionColumnWidth?: number
  onSearchArtist?: (artist: string, source: SongSearchItem['source']) => void
  onSearchAlbum?: (album: string, source: SongSearchItem['source']) => void
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

function pageTotal(
  page: number,
  pageSize: number,
  count: number,
  total?: number | null,
) {
  if (typeof total === 'number') return total
  const seen = (page - 1) * pageSize + count
  return count >= pageSize ? seen + 1 : seen
}

function splitArtistNames(artist: string) {
  const names = artist
    .split('/')
    .map((name) => name.trim())
    .filter(Boolean)

  return names.length > 0 ? names : [artist]
}

export default function MusicSongTable({
  songs,
  loading,
  emptyText,
  page,
  pageSize,
  total,
  onPageChange,
  renderActions,
  actionColumnWidth = 76,
  onSearchArtist,
  onSearchAlbum,
}: Props) {
  const {
    current,
    isPlaying,
    playLoading,
    preferredQuality,
    unsupportedFormat,
    playSong,
    togglePlay,
  } = useMusicPlayer()

  const isPlayingRow = useCallback(
    (row: SongSearchItem) => current?.id === row.id && current?.source === row.source,
    [current?.id, current?.source],
  )

  const handleRowActivate = useCallback((row: SongSearchItem) => {
    if (isPlayingRow(row) && !unsupportedFormat) {
      togglePlay()
      return
    }

    void playSong(row, preferredQuality)
  }, [isPlayingRow, playSong, preferredQuality, togglePlay, unsupportedFormat])

  const paginationNode = useMemo(() => (
    onPageChange && songs.length > 0 ? (
      <div className="music-pagination music-pagination--bottom">
        <Pagination
          current={page}
          pageSize={pageSize}
          total={pageTotal(page, pageSize, songs.length, total)}
          onChange={onPageChange}
          responsive
          showLessItems
          showSizeChanger={{
            popupClassName: 'music-pagination-size-dropdown',
          }}
          showQuickJumper={false}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          showTotal={(totalItems, range) => `${range[0]}-${range[1]} / ${totalItems}`}
        />
      </div>
    ) : null
  ), [onPageChange, page, pageSize, songs.length, total])

  const rowClassName = useCallback(
    (row: SongSearchItem) => (isPlayingRow(row) ? 'music-row-active' : ''),
    [isPlayingRow],
  )

  const tableLocale = useMemo(
    () => ({ emptyText: <Empty description={emptyText} /> }),
    [emptyText],
  )

  const handleTableRow = useCallback((row: SongSearchItem) => ({
    onClick: () => {
      handleRowActivate(row)
    },
    style: { cursor: 'pointer' },
  }), [handleRowActivate])

  return (
    <>
      <Table<SongSearchItem>
        rowKey={(row) => `${row.source}:${row.id}`}
        dataSource={songs}
        loading={loading}
        pagination={false}
        size="middle"
        className="music-song-table"
        columns={useMemo(() => [
          {
            title: '#',
            width: 52,
            render: (_value, _row, index) => (page - 1) * pageSize + index + 1,
          },
          {
            title: '歌曲',
            dataIndex: 'name',
            render: (name: string, row) => (
              <Space size={14}>
                <MusicCover
                  src={row.coverUrl}
                  size={44}
                  rounded={12}
                  className={isPlayingRow(row) && isPlaying ? 'music-dock-spin' : ''}
                />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: 360,
                      color: isPlayingRow(row) ? 'var(--accent)' : undefined,
                      transition: 'color 0.3s ease',
                    }}
                  >
                    {name}
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 13, opacity: 0.8 }}>
                    {row.artist
                      ? splitArtistNames(row.artist).map((artist, index) => (
                          <span key={`${row.source}:${row.id}:artist:${artist}`}>
                            {index > 0 ? ' / ' : null}
                            <button
                              type="button"
                              className="music-inline-link"
                              onClick={(event) => {
                                event.stopPropagation()
                                onSearchArtist?.(artist, row.source)
                              }}
                            >
                              {artist}
                            </button>
                          </span>
                        ))
                      : null}
                    {row.album ? (
                      <>
                        {' · '}
                        <button
                          type="button"
                          className="music-inline-link"
                          onClick={(event) => {
                            event.stopPropagation()
                            onSearchAlbum?.(row.album || '', row.source)
                          }}
                        >
                          {row.album}
                        </button>
                      </>
                    ) : (
                      ''
                    )}
                  </Typography.Text>
                </div>
              </Space>
            ),
          },
          {
            title: '来源',
            width: 92,
            render: (_value, row) => sourceLabel(row.source),
          },
          {
            title: '时长',
            dataIndex: 'durationSec',
            width: 84,
            render: (value?: number) => formatDuration(value),
          },
          {
            title: '',
            width: actionColumnWidth,
            render: (_value, row) => (
              <Space size={8} className="music-song-table__actions">
                {isPlayingRow(row) && isPlaying ? (
                  <button
                    type="button"
                    className="ctrl-btn"
                    style={{ width: 32, height: 32 }}
                    onClick={(event) => {
                      event.stopPropagation()
                      togglePlay()
                    }}
                    aria-label="暂停"
                    title="暂停"
                  >
                    <Pause size={16} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ctrl-btn primary"
                    style={{ width: 32, height: 32, boxShadow: 'none' }}
                    disabled={playLoading && isPlayingRow(row)}
                    onClick={(event) => {
                      event.stopPropagation()
                      handleRowActivate(row)
                    }}
                    aria-label="播放"
                    title="播放"
                  >
                    <Play size={16} />
                  </button>
                )}
                {renderActions?.(row)}
              </Space>
            ),
          },
        ], [
          actionColumnWidth,
          handleRowActivate,
          isPlaying,
          isPlayingRow,
          onSearchAlbum,
          onSearchArtist,
          page,
          pageSize,
          playLoading,
          renderActions,
          togglePlay,
        ])}
        rowClassName={rowClassName}
        onRow={handleTableRow}
        locale={tableLocale}
      />
      {paginationNode}
    </>
  )
}
