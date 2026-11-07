import { useRef } from 'react'
import { getAuthSessionId } from '../api/client'
import type { CurrentUserView } from '../types'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { canManageSystemConfig } from '../utils/permissions'
import XuechengApp from '../features/xuecheng/App.jsx'
import '../features/xuecheng/styles.css'

export default function XuechengPage() {
  const auth = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const sessionId = getAuthSessionId()
  const previous = useRef<{ sessionId: string | null; user: CurrentUserView | null }>({ sessionId: null, user: null })
  if (previous.current.sessionId !== sessionId || !auth.token) previous.current = { sessionId, user: null }
  if (auth.user) previous.current = { sessionId, user: auth.user }
  const user = auth.user || previous.current.user
  const shared = /^#\/s\/[A-Za-z0-9_-]+$/.test(location.hash)

  if (!shared && !auth.token) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search + location.hash }} replace />
  }
  if (!shared && !user) {
    return <div className="admin-shell-loading" role="status">正在确认登录状态…</div>
  }
  return (
    <div className="xuecheng-workspace">
      <XuechengApp
        key={shared ? location.hash : String(sessionId)}
        canUseMcp={canManageSystemConfig(user)}
        onBack={() => navigate('/admin')}
      />
    </div>
  )
}
