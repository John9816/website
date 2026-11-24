import { useNavigate } from 'react-router-dom'
import { sourceLabel } from '../features/music/sources'
import { Empty, Pagination, Popover, Space, Table, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Loader2, MoreHorizontal, Pause, Play } from 'lucide-react'
import { PAGE_SIZE_OPTIONS } from '../constants/pagination'
import MusicCover from './MusicCover'
import MusicQueueActions from './MusicQueueActions'
import { useMusicBrowse } from '../context/MusicPlayerContext'
import type { SongSearchItem } from '../types'
import { formatDuration } from '../utils/musicPlayer'

type Props = {
  songs: SongSearchItem[]
  loading: boolean
  emptyText: string
  page: number
  pageSize: number
  total?: number | null
  pageSizeOptions?: number[]
  onPageChange?: (nextPage: number, nextPageSize: number) => void
  renderActions?: (row: SongSearchItem) => ReactNode
  actionColumnWidth?: number
  onSearchArtist?: (artist: string, source: SongSearchItem['source'], artistId?: string) => void
  onSearchAlbum?: (album: string, source: SongSearchItem['source']) => void
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

function MusicSongTable({
  songs,
  loading,
  emptyText,
  page,
  pageSize,
  total,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  onPageChange,
  renderActions,
  actionColumnWidth = 76,
  onSearchAlbum,
}: Props) {
  const navigate = useNavigate()
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 700px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 700px)')
    const update = () => setCompact(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  const {
    openArtist, playPlaylist, playFromQueue, roamingSession,
    current,
    isPlaying,
    playLoading,
    pendingTrackKey,
    preferredQuality,
    unsupportedFormat,
    togglePlay,
  } = useMusicBrowse()

  const isPlayingRow = useCallback(
    (row: SongSearchItem) => current?.id === row.id && current?.source === row.source,
    [current?.id, current?.source],
  )

  const isLoadingRow = useCallback(
    (row: SongSearchItem) =>
      playLoading &&
      (pendingTrackKey
        ? pendingTrackKey === `${row.source}:${row.id}:${preferredQuality}`
        : isPlayingRow(row)),
    [isPlayingRow, pendingTrackKey, playLoading, preferredQuality],
  )

  const handleRowActivate = useCallback((row: SongSearchItem) => {
    if (isLoadingRow(row)) return
    if (isPlayingRow(row) && !unsupportedFormat) {
      togglePlay()
      return
    }

    const index = songs.findIndex(s => s.source === row.source && s.id === row.id)
    if (roamingSession?.list === songs) void playFromQueue(Math.max(0,index),preferredQuality)
    else void playPlaylist(songs, Math.max(0,index), preferredQuality)
  }, [isLoadingRow, isPlayingRow, playPlaylist, playFromQueue, roamingSession, songs, preferredQuality, togglePlay, unsupportedFormat])

  const paginationNode = useMemo(() => (
    onPageChange && (songs.length > 0 || page > 1) ? (
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
          pageSizeOptions={pageSizeOptions}
          showTotal={(totalItems, range) => `${range[0]}-${range[1]} / ${totalItems}`}
        />
      </div>
    ) : null
  ), [onPageChange, page, pageSize, pageSizeOptions, songs.length, total])

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

  const columns = useMemo<TableColumnsType<SongSearchItem>>(() => [
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
                                openArtist(
                                  row.source,
                                  row.artistIds?.[index] ?? (index === 0 ? row.artistId : undefined),
                                  artist,
                                )
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
                            if (row.albumId) navigate(`/music/album/${row.source}/${encodeURIComponent(row.albumId)}`)
                            else onSearchAlbum?.(row.album || '', row.source)
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
                {isPlayingRow(row) && isPlaying && !isLoadingRow(row) ? (
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
                    disabled={isLoadingRow(row)}
                    onClick={(event) => {
                      event.stopPropagation()
                      handleRowActivate(row)
                    }}
                    aria-label="播放"
                    title="播放"
                  >
                    {isLoadingRow(row) ? (
                      <Loader2 size={16} className="ctrl-btn__spinner" />
                    ) : (
                      <Play size={16} />
                    )}
                  </button>
                )}
                <MusicQueueActions song={row} />
                {renderActions?.(row)}
              </Space>
            ),
          },
        ], [
          actionColumnWidth,
          handleRowActivate,
          isPlaying,
          isPlayingRow,
          isLoadingRow,
          onSearchAlbum,
          openArtist,
          navigate,
          page,
          pageSize,
          renderActions,
          togglePlay,
        ])

  return (
    <>
      {compact ? <div className="music-song-list-mobile" aria-busy={loading}>
        {!songs.length ? <Empty description={loading?'正在加载…':emptyText}/> : songs.map((row,index) => <div className={`music-song-row${isPlayingRow(row)?' is-active':''}`} key={`${row.source}:${row.id}`} onClick={()=>handleRowActivate(row)}>
          <MusicCover src={row.coverUrl} size={46} rounded={10}/>
          <div className="music-song-row__copy"><button type="button" className="music-song-row__title" onClick={e=>{e.stopPropagation();handleRowActivate(row)}}>{row.name}</button><button type="button" className="music-song-row__artist" onClick={e=>{e.stopPropagation();openArtist(row.source,row.artistId,row.artist || '')}}>{row.artist || '未知歌手'}<span> · {sourceLabel(row.source).replace('（黑源）','')}</span></button></div>
          <button type="button" className="music-studio-icon" aria-label={isPlayingRow(row)&&isPlaying?'暂停':'播放'} disabled={isLoadingRow(row)} onClick={e=>{e.stopPropagation();handleRowActivate(row)}}>{isLoadingRow(row)?<Loader2 size={19} className="ctrl-btn__spinner"/>:isPlayingRow(row)&&isPlaying?<Pause size={19}/>:<Play size={19}/>}</button>
          {renderActions && <div onClick={e=>e.stopPropagation()}><Popover trigger="click" placement="topRight" content={<div className="music-song-actions-popover" aria-label={`${row.name}操作`}><MusicQueueActions song={row}/>{renderActions(row)}</div>}><button type="button" className="music-studio-icon" aria-label={`更多操作：${row.name}`}><MoreHorizontal size={20}/></button></Popover></div>}
          <span className="music-song-row__number">{(page-1)*pageSize+index+1}</span>
        </div>)}
      </div> : <Table<SongSearchItem>
        rowKey={(row) => `${row.source}:${row.id}`}
        dataSource={songs}
        loading={loading}
        pagination={false}
        size="middle"
        className="music-song-table"
        columns={columns}
        rowClassName={rowClassName}
        onRow={handleTableRow}
        locale={tableLocale}
      />}
      {paginationNode}
    </>
  )
}

export default memo(MusicSongTable)
