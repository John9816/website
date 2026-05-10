import { Empty, Pagination, Space, Table, Typography } from 'antd'
import type { ReactNode } from 'react'
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
  return count >= pageSize ? page * pageSize + 1 : page * pageSize
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

  const isPlayingRow = (row: SongSearchItem) =>
    current?.id === row.id && current?.source === row.source

  const handleRowActivate = (row: SongSearchItem) => {
    if (isPlayingRow(row) && !unsupportedFormat) {
      togglePlay()
      return
    }

    void playSong(row, preferredQuality)
  }

  const paginationNode =
    onPageChange && songs.length > 0 ? (
      <div className="music-pagination music-pagination--bottom">
        <Pagination
          current={page}
          pageSize={pageSize}
          total={pageTotal(page, pageSize, songs.length, total)}
          onChange={onPageChange}
          responsive
          showLessItems
          showSizeChanger
          showQuickJumper={false}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
        />
      </div>
    ) : null

  return (
    <>
      <Table<SongSearchItem>
        rowKey={(row) => `${row.source}:${row.id}`}
        dataSource={songs}
        loading={loading}
        pagination={false}
        size="middle"
        className="music-song-table"
        columns={[
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
                <MusicCover src={row.coverUrl} size={44} rounded={12} className={isPlayingRow(row) && isPlaying ? 'music-dock-spin' : ''} />
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
                    {row.artist}
                    {row.album ? ` · ${row.album}` : ''}
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
        ]}
        rowClassName={(row) => (isPlayingRow(row) ? 'music-row-active' : '')}
        onRow={(row) => ({
          onClick: () => {
            handleRowActivate(row)
          },
          style: { cursor: 'pointer' },
        })}
        locale={{ emptyText: <Empty description={emptyText} /> }}
      />
      {paginationNode}
    </>
  )
}
