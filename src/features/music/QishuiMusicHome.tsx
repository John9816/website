import MusicDailyPage from './MusicDailyPage'
import MusicRoamingPage from './MusicRoamingPage'
import '../../styles/music-daily-roam.css'

/**
 * 发现音乐 / 音乐漫游 的分发入口。
 * 历史上两个视图共用同一个 Hero + 同一张「为你推荐」表格，仅文案不同；
 * 现拆为两个独立产品页，各自只请求自己需要的数据。
 * 保持组件名与 props 不变，MusicExplorer / 路由 / 接口零改动。
 */
export default function QishuiMusicHome({
  view,
}: {
  view: 'discover' | 'roaming'
}) {
  return view === 'roaming' ? <MusicRoamingPage /> : <MusicDailyPage />
}
