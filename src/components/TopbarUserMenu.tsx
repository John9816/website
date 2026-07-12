import { useState } from 'react'
import { App as AntApp, Popover } from 'antd'
import { CalendarCheck, ChevronDown, Coins, LogOut, Shield, UserRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

function getDisplayName(username?: string | null) {
  return username?.trim() || '未命名用户'
}

function getAvatarText(username?: string | null) {
  const displayName = getDisplayName(username)
  const compact = displayName.replace(/\s+/g, '')
  return compact.slice(0, Math.min(2, compact.length)).toUpperCase()
}

function getRoleLabel(role?: 'ADMIN' | 'USER') {
  if (role === 'ADMIN') return '管理员账号'
  return '普通用户'
}

export default function TopbarUserMenu() {
  const auth = useAuth()
  const { message } = AntApp.useApp()
  const [open, setOpen] = useState(false)
  const [checkingIn, setCheckingIn] = useState(false)

  const username = auth.user?.username ?? auth.username
  const role = auth.user?.role
  const canManageSystemConfig = !!auth.user?.canManageSystemConfig
  const credits = auth.credits

  const handleLogout = () => {
    auth.logout()
    setOpen(false)
  }

  const handleCheckIn = async () => {
    setCheckingIn(true)
    try {
      const nextCredits = await auth.checkIn()
      message.success(`签到成功，积分 +${nextCredits.dailyCheckInReward}`)
    } catch (e) {
      message.error((e as Error).message)
      void auth.refreshCredits().catch(() => undefined)
    } finally {
      setCheckingIn(false)
    }
  }

  const content = (
    <div className="topbar-user-card">
      <div className="topbar-user-card__profile">
        <div className="topbar-user-card__avatar">{getAvatarText(username)}</div>
        <div className="topbar-user-card__summary">
          <strong>{getDisplayName(username)}</strong>
          <span>{getRoleLabel(role)}</span>
        </div>
      </div>

      <div className="topbar-user-card__meta">
        {credits && (
          <>
            <div className="topbar-user-card__meta-item">
              <span>积分余额</span>
              <b>{credits.credits}</b>
            </div>
            <div className="topbar-user-card__meta-item">
              <span>生图消耗</span>
              <b>{credits.imageCreditCost}/张</b>
            </div>
            <div className="topbar-user-card__meta-item">
              <span>签到奖励</span>
              <b>{credits.dailyCheckInReward}/天</b>
            </div>
          </>
        )}
        <div className="topbar-user-card__meta-item">
          <span>用户 ID</span>
          <b>{auth.user?.id ?? '--'}</b>
        </div>
        {canManageSystemConfig && (
          <div className="topbar-user-card__meta-item">
            <span>系统配置</span>
            <b>可管理</b>
          </div>
        )}
      </div>

      {credits && (
        <button
          type="button"
          className="topbar-user-card__checkin"
          onClick={() => void handleCheckIn()}
          disabled={credits.checkedInToday || checkingIn}
        >
          {credits.checkedInToday ? <CalendarCheck size={15} /> : <Coins size={15} />}
          <span>{credits.checkedInToday ? '今日已签到' : `签到领取 ${credits.dailyCheckInReward} 积分`}</span>
        </button>
      )}

      <button
        type="button"
        className="topbar-user-card__logout"
        onClick={handleLogout}
      >
        <LogOut size={15} />
        <span>退出登录</span>
      </button>
    </div>
  )

  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={setOpen}
      overlayClassName="topbar-user-popover"
      content={content}
    >
      <button type="button" className="topbar-user-trigger" aria-label="查看个人资料">
        <span className="topbar-user-trigger__avatar">{getAvatarText(username)}</span>
        <span className="topbar-user-trigger__name">{getDisplayName(username)}</span>
        {role === 'ADMIN' ? (
          <Shield size={14} className="topbar-user-trigger__icon" />
        ) : (
          <UserRound size={14} className="topbar-user-trigger__icon" />
        )}
        <ChevronDown size={14} className="topbar-user-trigger__chevron" />
      </button>
    </Popover>
  )
}
