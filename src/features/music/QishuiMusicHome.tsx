import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Empty, Skeleton } from 'antd'
import { ArrowRight, Compass, Pause, Play, Radio, RefreshCw, SkipForward, Square } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getQishuiAccount, qishuiDiscovery, qishuiRoamingModes } from '../../api/music'
import { useAuth } from '../../context/AuthContext'
import { useMusicPlayer } from '../../context/MusicPlayerContext'
import type { QishuiAccountView, QishuiFeedMode, SongSearchItem } from '../../types'
import MusicCover from '../../components/MusicCover'
import MusicSongTable from '../../components/MusicSongTable'
import QishuiAccountControl from './QishuiAccountControl'
export default function QishuiMusicHome({view}:{view:'discover'|'roaming'}) {
  const {token}=useAuth();const navigate=useNavigate();const player=useMusicPlayer()
  const [songs,setSongs]=useState<SongSearchItem[]>([]), [loading,setLoading]=useState(false), [error,setError]=useState('')
  const [account,setAccount]=useState<QishuiAccountView|null>(null), [modes,setModes]=useState<QishuiFeedMode[]>([])
  const [mode,setMode]=useState(''), [accountLoading,setAccountLoading]=useState(false), [accountError,setAccountError]=useState('')
  const [revision,setRevision]=useState(0)
  const reload=useCallback(()=>setRevision(n=>n+1),[])
  useEffect(()=>{setAccount(null);setSongs([])},[token])
  useEffect(()=>{window.addEventListener('qishui-account-changed',reload);return()=>window.removeEventListener('qishui-account-changed',reload)},[reload])
  useEffect(()=>{
    if(!token)return
    const c=new AbortController();setLoading(true);setError('')
    void qishuiDiscovery(c.signal).then(v=>{if(!c.signal.aborted)setSongs(v.list)}).catch(()=>{if(!c.signal.aborted)setError('推荐暂时未能加载，请稍后重试。')}).finally(()=>{if(!c.signal.aborted)setLoading(false)})
    return()=>c.abort()
  },[token,revision])
  useEffect(()=>{
    if(!token)return
    const c=new AbortController();setAccountLoading(true);setAccountError('');setModes([])
    void getQishuiAccount(c.signal).then(async a=>{
      if(c.signal.aborted)return;setAccount(a)
      if(a.bound && a.status!=='expired'){
        const list=await qishuiRoamingModes(c.signal);if(!c.signal.aborted){setModes(list);setMode(previous=>list.some(m=>m.id===previous)?previous:list.some(m=>m.id===player.roamingSession?.modeId)?player.roamingSession!.modeId:list[0]?.id || '')}
      }
    }).catch(()=>{if(!c.signal.aborted)setAccountError('账号状态或漫游场景加载失败，请重试。')}).finally(()=>{if(!c.signal.aborted)setAccountLoading(false)})
    return()=>c.abort()
  },[token,revision])
  const ready=account?.bound && account.status!=='expired'
  const featured=player.current || songs[0]
  const lyric=player.lyricLines[player.activeLyricIndex]?.text
  const active=player.roamingSession
  return <div className="music-home">
    <div className="music-home__intro"><span><Compass size={17}/> 汽水音乐</span><h2>{view==='roaming'?'让下一首，接着你的心情。':'发现音乐，从这一首开始。'}</h2><p>{view==='roaming'?'按场景收听个人推荐，队列播完后继续为你选歌。':'官方歌曲推荐、你的音乐漫游，以及完整的歌曲与歌手资料。'}</p></div>
    <div className="music-home__grid">
      <section className="music-home__listening" aria-label="收听卡片">
        <div className="music-home__cover"><MusicCover src={featured?.coverUrl} size={180} rounded={18}/>{player.isPlaying && <span className="music-home__playing-bars" aria-label="正在播放"><i/><i/><i/><i/></span>}</div>
        <div className="music-home__listening-copy"><small>{player.current?'正在收听':'推荐你听'}</small><h3>{featured?.name || '准备好，听一首新歌'}</h3>
          {featured?.artist && <button className="music-inline-link" onClick={()=>player.openArtist(featured.source,featured.artistId,featured.artist || '')}>{featured.artist}</button>}
          <p className="music-home__lyric">{lyric || (player.lyricLoading?'歌词正在路上…':featured?.album || '从熟悉的旋律，走向新的发现。')}</p>
          <div className="music-home__actions"><Button type="primary" icon={player.current&&player.isPlaying?<Pause size={16}/>:<Play size={16}/>} disabled={!featured} loading={player.playLoading} onClick={()=>player.current?player.togglePlay():void player.playPlaylist(songs)}>{player.current?(player.isPlaying?'暂停':'继续播放'):'开始收听'}</Button>
            {player.current && <Button icon={<SkipForward size={16}/>} disabled={!player.canNext || player.roamingBusy} onClick={player.playNext}>下一首</Button>}
          </div>
        </div>
      </section>
      <section className="music-home__radio" aria-label="音乐漫游控制">
        <div className="music-home__section-label"><Radio size={19}/><strong>音乐漫游</strong><span>{active?'进行中':ready?'已连接':'等待连接'}</span></div>
        <p>{ready?`为 ${account.nickname || '你'} 持续推荐歌曲`:'绑定汽水账号，开启属于你的推荐。普通搜索与公开推荐无需扫码。'}</p>
        {accountLoading ? <Skeleton active paragraph={{rows:1}} title={false}/> : ready && modes.length>0 ? <label className="music-home__mode">收听场景<select aria-label="漫游场景" value={mode} disabled={player.roamingBusy} onChange={e=>setMode(e.target.value)}>{Array.from(new Set(modes.map(m=>m.group || '推荐'))).map(group=><optgroup key={group} label={group}>{modes.filter(m=>(m.group || '推荐')===group).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>)}</select></label> : <QishuiAccountControl/>}
        {accountError && <Alert type="warning" message={accountError} action={<Button onClick={reload}>重试</Button>}/>}
        {ready && <div className="music-home__actions"><Button type="primary" icon={<Radio size={16}/>} disabled={accountLoading || !modes.length} loading={player.roamingBusy} onClick={()=>void player.startRoaming(mode || undefined)}>{active?'按所选场景重新开始':'开始漫游'}</Button>{active && <Button icon={<Square size={15}/>} onClick={player.stopRoaming}>结束</Button>}</div>}
        {player.roamingError && <Alert type="warning" message={player.roamingError} action={active?<Button disabled={player.roamingBusy} onClick={()=>void player.nextRoaming()}>重试</Button>:undefined}/>}
        {active && <div className="music-home__radio-status"><span>{modes.find(m=>m.id===active.modeId)?.name || '个人推荐'} · 当前 {active.list.length} 首</span><Button size="small" disabled={!active.hasMore || player.roamingBusy} onClick={()=>void player.nextRoaming()}>换一批</Button></div>}
      </section>
    </div>
    <div className="music-home__shortcuts"><button onClick={()=>navigate('/music?view=search&source=qishui')}><span>搜索歌曲 / 歌手 / 专辑</span><ArrowRight size={16}/></button><button onClick={()=>navigate('/music?view=my-playlists')}><span>我的歌单与分享导入</span><ArrowRight size={16}/></button><button onClick={()=>navigate('/music?view=favorites')}><span>我喜欢的音乐</span><ArrowRight size={16}/></button></div>
    {view==='roaming' && active && <section><div className="music-home__section-head"><h3>当前漫游队列</h3><span>播完后继续推荐 · 切换页面不中断</span></div><MusicSongTable songs={active.list} loading={player.roamingBusy} emptyText="暂无推荐，可重新开始漫游" page={1} pageSize={30}/></section>}
    <section><div className="music-home__section-head"><div><h3>汽水为你推荐</h3><p>官方歌曲推荐 · 无需绑定汽水账号</p></div><div className="music-home__actions"><Button icon={<Play size={15}/>} disabled={!songs.length} onClick={()=>void player.playPlaylist(songs)}>播放全部</Button><Button icon={<RefreshCw size={15}/>} loading={loading} onClick={reload}>刷新</Button></div></div>
      {error?<Alert type="warning" message={error} action={<Button onClick={reload}>重试</Button>}/>:loading&&!songs.length?<Skeleton active paragraph={{rows:7}}/>:songs.length?<MusicSongTable songs={songs} loading={loading} emptyText="暂无推荐" page={1} pageSize={songs.length}/>:<Empty description="暂时没有推荐歌曲，试试搜索喜欢的歌手"/>}
    </section>
  </div>
}
