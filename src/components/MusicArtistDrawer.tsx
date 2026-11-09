import { useEffect, useState } from 'react'
import { Alert, Button, Drawer, Empty, Pagination, Segmented, Spin } from 'antd'
import { useNavigate } from 'react-router-dom'
import { musicArtistDetail, musicArtistWorks, musicSearch } from '../api/music'
import { useMusicBrowse } from '../context/MusicPlayerContext'
import { useAuth } from '../context/AuthContext'
import type { ArtistDetailView, ArtistWorksView } from '../types'
import MusicCover from './MusicCover'
import MusicSongTable from './MusicSongTable'
import { sourceLabel } from '../features/music/sources'
export default function MusicArtistDrawer() {
  const {artistTarget:target, closeArtist, playPlaylist} = useMusicBrowse()
  const {token} = useAuth();const navigate=useNavigate()
  const [tab,setTab]=useState<'song'|'album'>('song'), [page,setPage]=useState(1), [retry,setRetry]=useState(0)
  const [detail,setDetail]=useState<ArtistDetailView|null>(null), [works,setWorks]=useState<ArtistWorksView|null>(null)
  const [loading,setLoading]=useState(false), [error,setError]=useState('')
  useEffect(()=>{setTab('song');setPage(1);setDetail(null);setWorks(null)},[target])
  useEffect(()=>{
    if(!target || !token)return
    let cancelled=false;setLoading(true);setError('');setWorks(null)
    const load=async()=>{
      if(!target.id){const result=await musicSearch(target.source,target.name,page,30,'song');return {artistId:'',source:target.source,type:'song',page,pageSize:30,total:result.total,songs:result.list,albums:[]} as ArtistWorksView}
      return musicArtistWorks(target.source,target.id,tab,page,30)
    }
    void load().then(v=>{if(!cancelled)setWorks(v)}).catch(e=>{if(!cancelled)setError(e.message || '歌手作品加载失败')}).finally(()=>{if(!cancelled)setLoading(false)})
    if(target.id) void musicArtistDetail(target.source,[target.id]).then(v=>{if(!cancelled)setDetail(v[0] || null)}).catch(()=>{})
    return()=>{cancelled=true}
  },[target,tab,page,retry,token])
  return <Drawer open={!!target} onClose={closeArtist} width="min(900px, 100vw)" title="歌手作品" className="music-studio-overlay" destroyOnHidden>
    {target && <div className="music-artist-profile">
      <MusicCover src={detail?.coverUrl} size={88} rounded={44}/><div><small>{sourceLabel(target.source)}</small><h2>{detail?.name || target.name || '歌手'}</h2><p>{detail?.songCount != null ? `${detail.songCount} 首歌曲` : '探索歌曲与专辑'}{detail?.albumCount != null ? ` · ${detail.albumCount} 张专辑` : ''}</p></div>
    </div>}
    {detail?.description && <p className="music-artist-description">{detail.description}</p>}
    {target && !target.id && <p>此曲目暂未提供歌手标识，以下为歌手名称的搜索结果。</p>}
    <div className="music-library-toolbar"><Segmented value={tab} options={[{value:'song',label:'歌曲'},{value:'album',label:'专辑',disabled:!target?.id}]} onChange={v=>{setTab(v as 'song'|'album');setPage(1)}}/>
      {tab==='song' && <Button disabled={!works?.songs.length} onClick={()=>void playPlaylist(works?.songs || [])}>播放本页</Button>}
    </div>
    {error && <Alert type="warning" message={error} action={<Button onClick={()=>setRetry(n=>n+1)}>重试</Button>}/>}
    {tab==='song' ? <MusicSongTable songs={works?.songs || []} loading={loading} emptyText="暂无歌曲" page={page} pageSize={30} total={works?.total} onPageChange={setPage}/> : <>
      {loading ? <Spin/> : works?.albums?.length ? <div className="music-artist-albums">{works.albums.map(album=><button type="button" key={album.id} onClick={()=>{closeArtist();navigate(`/music/album/${target?.source}/${encodeURIComponent(album.id)}`)}}><MusicCover src={album.coverUrl} size={96} rounded={12}/><strong>{album.name}</strong><small>{album.publishTime || '专辑'}</small></button>)}</div> : <Empty description="暂无专辑"/>}
      {!!works?.albums?.length && <Pagination current={page} pageSize={30} total={works.total ?? (page-1)*30+works.albums.length+(works.albums.length===30?1:0)} onChange={setPage} showSizeChanger={false}/>}
    </>}
  </Drawer>
}
