import AppShell from '../components/AppShell'
import '../styles/server-monitor.css'

/**
 * 服务器监控页：把独立的监控面板（/monitor/，由 nginx + Python agent 提供）内嵌进站点，
 * 让顶部导航常驻、高亮与其它空间一致，而不是整页跳出到独立 HTML。
 *
 * 监控面板使用相对路径 api/live、api/history 请求数据；iframe 的 src 为 /monitor/，
 * 因此这些请求会解析到 /monitor/api/*，由 nginx 反代到本地 agent，无需额外配置。
 */
export default function ServerMonitorPage() {
  return (
    <AppShell>
      <main className="server-monitor" aria-label="服务器监控">
        <iframe
          className="server-monitor__frame"
          src="/monitor/"
          title="服务器监控面板"
          loading="eager"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </main>
    </AppShell>
  )
}
