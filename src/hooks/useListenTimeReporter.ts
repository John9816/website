import { useEffect, useRef } from 'react'
import { getToken, request } from '../api/client'

const REPORT_INTERVAL_MS = 30_000
const MAX_SECONDS_PER_REPORT = 30

/**
 * 向后端上报「真实播放秒数」，供听歌时长周榜 / 月榜统计使用。
 *
 * 只统计播放器时钟真正在走的时间：以 currentTime 增量为基准，再用墙钟时间
 * 与 30s 上限双重夹逼，因此拖动进度条、后台标签页被冻结、系统时钟跳变都
 * 不会造成虚高。未登录（含分享页匿名访客）、暂停、切歌间隙一律不上报；
 * 上报失败静默忽略，绝不干扰播放。
 *
 * 播放器由 rAF 平滑时钟驱动 currentTime（约 40ms 粒度），这里用 ref 持有
 * 最新值，interval 只在挂载时建立一次，不会随每帧重渲染反复重建。
 */
export function useListenTimeReporter(isPlaying: boolean, currentTime: number) {
  const latest = useRef({ isPlaying, currentTime })
  latest.current = { isPlaying, currentTime }

  useEffect(() => {
    let lastTime = latest.current.currentTime
    let lastTick = Date.now()
    let inFlight = false

    const report = (seconds: number) => {
      if (seconds <= 0 || inFlight || !getToken()) return
      inFlight = true
      void request<void>('/api/user/music/listening/heartbeat', {
        method: 'POST',
        auth: true,
        body: { seconds },
      }).then(
        () => { inFlight = false },
        () => { inFlight = false },
      )
    }

    const sample = () => {
      const now = Date.now()
      const wall = (now - lastTick) / 1000
      const cur = latest.current.currentTime
      const advanced = cur - lastTime
      lastTick = now
      lastTime = cur
      if (!latest.current.isPlaying) return
      report(Math.floor(Math.min(Math.max(advanced, 0), wall, MAX_SECONDS_PER_REPORT)))
    }

    const id = window.setInterval(sample, REPORT_INTERVAL_MS)

    // 页面隐藏时补发一次不足一个周期的尾巴，避免最后 <30s 直接丢失。
    // 同样受墙钟夹逼：标签页被冻结时 currentTime 不推进，不会多报。
    const flush = () => {
      if (document.visibilityState !== 'hidden') return
      sample()
    }
    document.addEventListener('visibilitychange', flush)

    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', flush)
    }
  }, [])
}
