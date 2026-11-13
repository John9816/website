import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installViewportMetrics } from './utils/viewport'
import './index.css'
import './styles/tokens.css'
import './styles/aurora-visual.css'

installViewportMetrics()

// Aurora Live：环境光档位持久化，页面切到后台时暂停装饰动画以省电。
// 档位值：off / low / high，默认不写 data-aurora（使用标准强度）。
try {
  const level = localStorage.getItem('aurora-visual-level')
  if (level === 'off' || level === 'low' || level === 'high') {
    document.documentElement.dataset.aurora = level
  }
} catch {
  // 隐私模式下 localStorage 不可用，保持默认档位
}

const syncAuroraPause = () => {
  document.documentElement.dataset.auroraPaused = document.hidden ? 'true' : 'false'
}
document.addEventListener('visibilitychange', syncAuroraPause)
syncAuroraPause()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
