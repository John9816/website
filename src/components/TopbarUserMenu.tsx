import { useRef, useState } from 'react'
import { App as AntApp, Button, Form, Input, Modal, Popover } from 'antd'
import {
  CalendarCheck,
  Camera,
  ChevronDown,
  Coins,
  Edit3,
  LayoutDashboard,
  LogOut,
  Shield,
  UserRound,
} from 'lucide-react'
import { Link as RouterLink } from 'react-router-dom'
import { updateUserProfile, uploadUserAvatar } from '../api/auth'
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

function UserAvatar({
  avatarUrl,
  username,
  className,
}: {
  avatarUrl?: string | null
  username?: string | null
  className: string
}) {
  if (avatarUrl) {
    return <img className={className} src={avatarUrl} alt="" referrerPolicy="no-referrer" />
  }
  return <span className={className}>{getAvatarText(username)}</span>
}

export default function TopbarUserMenu() {
  const auth = useAuth()
  const { message } = AntApp.useApp()
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [checkingIn, setCheckingIn] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [profileForm] = Form.useForm<{ username: string; email: string }>()

  const username = auth.user?.username ?? auth.username
  const role = auth.user?.role
  const avatarUrl = auth.user?.avatarUrl
  const isAdmin = role === 'ADMIN'
  const canManageSystemConfig = !!auth.user?.canManageSystemConfig
  const credits = auth.credits

  const handleLogout = () => {
    auth.logout()
    setOpen(false)
  }

  const openProfileEditor = () => {
    profileForm.setFieldsValue({
      username: auth.user?.username ?? auth.username ?? '',
      email: auth.user?.email ?? '',
    })
    setOpen(false)
    setProfileOpen(true)
  }

  const saveProfile = async () => {
    const values = await profileForm.validateFields()
    setSavingProfile(true)
    try {
      const profile = await updateUserProfile({
        username: values.username.trim(),
        email: values.email.trim(),
      })
      auth.updateProfile(profile)
      message.success('资料已更新')
      setProfileOpen(false)
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setSavingProfile(false)
    }
  }

  const uploadAvatar = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      message.error('头像不能超过 2MB')
      return
    }
    setUploadingAvatar(true)
    try {
      const profile = await uploadUserAvatar(file)
      auth.updateProfile(profile)
      message.success('头像已更新')
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setUploadingAvatar(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
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
        <UserAvatar
          className="topbar-user-card__avatar"
          avatarUrl={avatarUrl}
          username={username}
        />
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
        {isAdmin && (
          <div className="topbar-user-card__meta-item">
            <span>后台权限</span>
            <b>{canManageSystemConfig ? '系统管理' : '管理员'}</b>
          </div>
        )}
      </div>

      <RouterLink
        to="/admin"
        className="topbar-user-card__admin"
        onClick={() => setOpen(false)}
      >
        <LayoutDashboard size={15} />
        <span>进入后台</span>
      </RouterLink>

      <Button
        block
        type="primary"
        icon={<Edit3 size={15} />}
        onClick={openProfileEditor}
      >
        编辑资料
      </Button>

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
    <>
      <Popover
        trigger="click"
        placement="bottomRight"
        open={open}
        onOpenChange={setOpen}
        overlayClassName="topbar-user-popover"
        content={content}
      >
        <button type="button" className="topbar-user-trigger" aria-label="查看个人资料">
          <UserAvatar
            className="topbar-user-trigger__avatar"
            avatarUrl={avatarUrl}
            username={username}
          />
          <span className="topbar-user-trigger__name">{getDisplayName(username)}</span>
          {role === 'ADMIN' ? (
            <Shield size={14} className="topbar-user-trigger__icon" />
          ) : (
            <UserRound size={14} className="topbar-user-trigger__icon" />
          )}
          <ChevronDown size={14} className="topbar-user-trigger__chevron" />
        </button>
      </Popover>
      <Modal
        title="编辑资料"
        open={profileOpen}
        confirmLoading={savingProfile}
        onCancel={() => setProfileOpen(false)}
        onOk={() => void saveProfile()}
        destroyOnHidden
      >
        <div className="topbar-profile-avatar-editor">
          <UserAvatar
            className="topbar-profile-avatar-editor__preview"
            avatarUrl={avatarUrl}
            username={username}
          />
          <div className="topbar-profile-avatar-editor__actions">
            <Button
              icon={<Camera size={15} />}
              loading={uploadingAvatar}
              onClick={() => avatarInputRef.current?.click()}
            >
              上传头像
            </Button>
            <span>支持 JPG、PNG、WebP、GIF，最大 2MB。</span>
          </div>
          <input
            ref={avatarInputRef}
            className="topbar-profile-avatar-editor__input"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(event) => void uploadAvatar(event.target.files?.[0])}
          />
        </div>

        <Form form={profileForm} layout="vertical">
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true }, { min: 3, max: 50 }]}
          >
            <Input autoComplete="username" placeholder="3-50 个字符" />
          </Form.Item>
          <Form.Item
            name="email"
            label="QQ 邮箱"
            rules={[
              { required: true },
              { pattern: /^[1-9]\d{4,10}@qq\.com$/i, message: '请输入有效的 QQ 邮箱' },
            ]}
          >
            <Input autoComplete="email" placeholder="例如 123456@qq.com" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
