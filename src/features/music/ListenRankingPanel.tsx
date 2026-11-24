import { useCallback, useEffect, useRef, useState } from 'react'
import { Segmented } from 'antd'
import { Crown, Headphones, RefreshCw, TrendingUp, UserRound } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { musicListeningRanking, myListeningTime } from '../../api/music'
import type { ListenRankItem, ListenRankingView, MyListenTimeView } from '../../types'

type Period = 'week' | 'month'

/** 把秒数格式化成「X小时Y分 / X分钟」 */
function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0 分钟'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  return `${minutes} 分钟`
}

function compactDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0分'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours}小时${minutes}分` : `${minutes}分钟`
}

const RANK_COLORS: Record<number, string> = {
  1: '#e8b923',
  2: '#c7ced6',
  3: '#cd7f45',
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1 || rank === 2 || rank === 3) {
    return (
      <span className="listen-rank__badge listen-rank__badge--top" style={{ ['--rank-color' as string]: RANK_COLORS[rank] }}>
        <Crown size={13} strokeWidth={2.4} />
        <b>{rank}</b>
      </span>
    )
  }
  return <span className="listen-rank__badge">{rank}</span>
}

function Avatar({ url }: { url?: string | null }) {
  if (url) {
    return <img className="listen-rank__avatar" src={url} alt="" loading="lazy" />
  }
  return (
    <span className="listen-rank__avatar listen-rank__avatar--fallback" aria-hidden>
      <UserRound size={20} />
    </span>
  )
}

/** 我的听歌数据卡：累计 / 本周 / 本月 + 周榜月榜排名 */
function MyListenCard({ mine, loggedIn }: { mine: MyListenTimeView | null; loggedIn: boolean }) {
  if (!loggedIn || !mine) {
    return (
      <div className="listen-rank__me-card listen-rank__me-card--guest">
        <UserRound size={20} />
        <span>登录后可查看我的听歌时长与排名，并参与上榜</span>
      </div>
    )
  }
  return (
    <section className="listen-rank__me-card" aria-label="我的听歌数据">
      <div className="listen-rank__me-head">
        <TrendingUp size={17} />
        <strong>我的听歌数据</strong>
      </div>
      <div className="listen-rank__stats">
        <div className="listen-rank__stat">
          <span>累计</span>
          <b>{formatDuration(mine.totalSec)}</b>
        </div>
        <div className="listen-rank__stat">
          <span>本周</span>
          <b>{formatDuration(mine.weekSec)}</b>
        </div>
        <div className="listen-rank__stat">
          <span>本月</span>
          <b>{formatDuration(mine.monthSec)}</b>
        </div>
      </div>
      <div className="listen-rank__me-ranks">
        <div className="listen-rank__me-rank">
          <span>周榜</span>
          <b>{mine.weekRank > 0 ? `第 ${mine.weekRank} 名` : '未上榜'}</b>
          <small>{mine.weekParticipants} 人参与</small>
        </div>
        <div className="listen-rank__me-rank">
          <span>月榜</span>
          <b>{mine.monthRank > 0 ? `第 ${mine.monthRank} 名` : '未上榜'}</b>
          <small>{mine.monthParticipants} 人参与</small>
        </div>
      </div>
    </section>
  )
}

export default function ListenRankingPanel() {
  const auth = useAuth()
  const [period, setPeriod] = useState<Period>('week')
  const [ranking, setRanking] = useState<ListenRankingView | null>(null)
  const [mine, setMine] = useState<MyListenTimeView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const tasks: Promise<unknown>[] = [
        musicListeningRanking(period, 50),
        auth.token ? myListeningTime().catch(() => null) : Promise.resolve(null),
      ]
      const [rankResult, mineResult] = await Promise.all(tasks)
      if (requestId !== requestIdRef.current) return
      setRanking(rankResult as ListenRankingView)
      setMine((mineResult as MyListenTimeView | null) ?? null)
      setLoading(false)
    } catch (e) {
      if (requestId !== requestIdRef.current) return
      setError(e instanceof Error ? e.message : '加载失败')
      setLoading(false)
    }
  }, [period, auth.token])

  useEffect(() => {
    void load()
    return () => { requestIdRef.current++ }
  }, [load])

  const myId = auth.user?.id
  const isMe = (item: ListenRankItem) =>
    myId != null && item.userId != null && String(item.userId) === String(myId)

  return (
    <div className="listen-rank">
      <MyListenCard mine={mine} loggedIn={!!auth.token} />

      <div className="listen-rank__toolbar">
        <Segmented<Period>
          options={[
            { label: '本周', value: 'week' },
            { label: '本月', value: 'month' },
          ]}
          value={period}
          onChange={(v) => setPeriod(v)}
        />
        <button className="listen-rank__refresh" type="button" onClick={() => void load()} aria-label="刷新榜单" title="刷新">
          <RefreshCw size={15} className={loading ? 'is-spinning' : ''} />
        </button>
      </div>

      {loading && !ranking ? (
        <div className="listen-rank__state">
          <Headphones size={26} />
          <span>正在加载榜单…</span>
        </div>
      ) : error && !ranking ? (
        <div className="listen-rank__state">
          <span>{error}</span>
          <button type="button" onClick={() => void load()}>重试</button>
        </div>
      ) : !ranking || ranking.items.length === 0 ? (
        <div className="listen-rank__state">
          <Headphones size={26} />
          <span>暂无听歌记录，快去听歌上榜吧</span>
        </div>
      ) : (
        <>
          <p className="listen-rank__hint">
            共 {ranking.participants} 位用户参与 · 按真实播放时长排名 · {ranking.from} 起
          </p>
          <ol className="listen-rank__list">
            {ranking.items.map((item) => (
              <li
                key={`${item.userId ?? item.username}-${item.rank}`}
                className={`listen-rank__row${isMe(item) ? ' is-me' : ''}${item.rank <= 3 ? ' is-top' : ''}`}
              >
                <RankBadge rank={item.rank} />
                <Avatar url={item.avatarUrl} />
                <div className="listen-rank__user">
                  <strong>{item.username || '音乐爱好者'}{isMe(item) && <em>（我）</em>}</strong>
                  <span>听歌 {compactDuration(item.seconds)}</span>
                </div>
                <Headphones className="listen-rank__row-icon" size={16} />
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
