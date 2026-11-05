import { useEffect, useRef, useState } from 'react'
import { App as AntApp, Button, Form, Input, Modal, Popover } from 'antd'
import {
  CalendarCheck,
  Camera,
  ChevronDown,
  Copy,
  Coins,
  Crown,
  Edit3,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Shield,
  Ticket,
  UserRound,
} from 'lucide-react'
import { Link as RouterLink } from 'react-router-dom'
import { updateUserProfile, uploadUserAvatar } from '../api/auth'
import { getMembership, redeemMembershipCode } from '../api/membership'
import { useAuth } from '../context/AuthContext'
import { MEMBERSHIP_ENABLED } from '../config/features'
import type { MembershipView } from '../types'
import { writeClipboardText } from '../utils/clipboard'
import { ACCOUNT_EMAIL_HINT, ACCOUNT_EMAIL_PATTERN } from '../utils/email'

const QQ_GROUP_NUMBER = '775832976'
const QQ_GROUP_JOIN_URL = `mqqapi://card/show_pslcard?src_type=internal&version=1&uin=${QQ_GROUP_NUMBER}&card_type=group&source=qrcode`

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

function getMembershipExpiryMs(membership: MembershipView | null) {
  if (!membership?.expiresAt) return null
  const parsed = Date.parse(membership.expiresAt.replace(' ', 'T'))
  return Number.isNaN(parsed) ? null : parsed
}

function isMembershipActive(membership: MembershipView | null, now: number) {
  if (!membership?.active) return false
  if (membership.lifetime) return true
  const expiresAt = getMembershipExpiryMs(membership)
  return expiresAt === null ? membership.active : expiresAt > now
}

function formatMembershipRemaining(membership: MembershipView | null, now: number) {
  if (!membership?.active) return '未开通'
  if (membership.lifetime) return '永久有效'
  const expiresAt = getMembershipExpiryMs(membership)
  const seconds = expiresAt === null
    ? membership.remainingSeconds ?? 0
    : Math.max(0, Math.floor((expiresAt - now) / 1000))
  if (seconds > 0) {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    if (days > 0) return `剩余 ${days} 天 ${hours} 小时`
    return `剩余 ${Math.max(1, Math.ceil(seconds / 3600))} 小时`
  }
  return '已过期'
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
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (avatarUrl && avatarUrl !== failedUrl) {
    return <img className={className} src={avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailedUrl(avatarUrl)} />
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
  const [membership, setMembership] = useState<MembershipView | null>(null)
  const [membershipNow, setMembershipNow] = useState(() => Date.now())
  const [membershipLoading, setMembershipLoading] = useState(false)
  const [redeemOpen, setRedeemOpen] = useState(false)
  const [redeeming, setRedeeming] = useState(false)
  const [redeemForm] = Form.useForm<{ code: string }>()

  const username = auth.user?.username ?? auth.username
  const role = auth.user?.role
  const avatarUrl = auth.user?.avatarUrl
  const isAdmin = role === 'ADMIN'
  const canManageSystemConfig = !!auth.user?.canManageSystemConfig
  const credits = auth.credits
  const membershipActive = isMembershipActive(membership, membershipNow)

  useEffect(() => {
    if (!MEMBERSHIP_ENABLED || !auth.token) {
      setMembership(null)
      return
    }
    let cancelled = false
    setMembershipLoading(true)
    getMembership()
      .then((data) => {
        if (!cancelled) {
          setMembership(data)
          setMembershipNow(Date.now())
        }
      })
      .catch(() => {
        if (!cancelled) setMembership(null)
      })
      .finally(() => {
        if (!cancelled) setMembershipLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [auth.token])

  useEffect(() => {
    if (!membership?.active || membership.lifetime || !membership.expiresAt) return
    const timer = window.setInterval(() => setMembershipNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [membership?.active, membership?.expiresAt, membership?.lifetime])

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
    } catch (error) {
      message.error((error as Error).message)
      void auth.refreshCredits().catch(() => undefined)
    } finally {
      setCheckingIn(false)
    }
  }

  const handleRedeem = async () => {
    if (!MEMBERSHIP_ENABLED) return
    const values = await redeemForm.validateFields()
    setRedeeming(true)
    try {
      const result = await redeemMembershipCode(values.code.trim())
      setMembership(result.membership)
      setMembershipNow(Date.now())
      message.success(result.message)
      setRedeemOpen(false)
      redeemForm.resetFields()
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setRedeeming(false)
    }
  }

  const openRedeem = () => {
    if (!MEMBERSHIP_ENABLED) return
    setOpen(false)
    setRedeemOpen(true)
  }

  const copyGroupNumber = async () => {
    try {
      await writeClipboardText(QQ_GROUP_NUMBER)
      message.success('群号已复制')
    } catch {
      message.error(`复制失败，请手动搜索群号 ${QQ_GROUP_NUMBER}`)
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

      {MEMBERSHIP_ENABLED && <div className="topbar-user-card__membership">
        <div className="topbar-user-card__membership-head">
          <span>会员状态</span>
          {membershipLoading ? (
            <b>加载中...</b>
          ) : (
            <b className={membershipActive ? 'is-active' : undefined}>
              {membershipActive ? (membership?.lifetime ? '永久会员' : '已开通') : '未开通'}
            </b>
          )}
        </div>
        {membershipActive && (
          <div className="topbar-user-card__membership-meta">
            <span>
              {membership?.typeName || membership?.type || '会员'}
              {membership?.lifetime ? ' · 永久' : ''}
            </span>
            <b>{formatMembershipRemaining(membership, membershipNow)}</b>
          </div>
        )}
      </div>}

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

      {MEMBERSHIP_ENABLED && <button type="button" className="topbar-user-card__redeem" onClick={openRedeem}>
        <Ticket size={15} />
        <span>兑换会员卡</span>
      </button>}

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
      {MEMBERSHIP_ENABLED && <a
        className="topbar-redeem-entry"
        href={QQ_GROUP_JOIN_URL}
        title={`加入 QQ 群 ${QQ_GROUP_NUMBER} 获取兑换码`}
        aria-label={`加入 QQ 群 ${QQ_GROUP_NUMBER} 获取兑换码`}
      >
        <Ticket size={15} />
        <span className="topbar-redeem-entry__desktop">加群领兑换码</span>
        <span className="topbar-redeem-entry__mobile">领兑换码</span>
      </a>}
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
      {MEMBERSHIP_ENABLED && <Modal
        title="兑换会员卡"
        open={redeemOpen}
        confirmLoading={redeeming}
        onCancel={() => setRedeemOpen(false)}
        onOk={() => void handleRedeem()}
        destroyOnHidden
      >
        <div className="topbar-redeem-tip">
          <Crown size={16} />
          <span>输入会员兑换码，兑换后可用于网页音乐播放等会员功能。</span>
        </div>
        <div className="topbar-redeem-group">
          <div className="topbar-redeem-group__copy">
            <strong>获取兑换码</strong>
            <span>
              加入 QQ 群 <b>{QQ_GROUP_NUMBER}</b> 获取兑换码
            </span>
          </div>
          <div className="topbar-redeem-group__actions">
            <Button
              type="primary"
              icon={<MessageCircle size={15} />}
              href={QQ_GROUP_JOIN_URL}
            >
              一键加群
            </Button>
            <Button icon={<Copy size={15} />} onClick={() => void copyGroupNumber()}>
              复制群号
            </Button>
          </div>
        </div>
        <Form
          form={redeemForm}
          layout="vertical"
          onFinish={() => void handleRedeem()}
        >
          <Form.Item
            name="code"
            label="兑换码"
            rules={[{ required: true, message: '请输入兑换码' }]}
            normalize={(value: string) =>
              (value || '').toUpperCase().replace(/\s+/g, '')
            }
          >
            <Input placeholder="OW-XXXX-XXXX-XXXX-XXXX" autoComplete="off" />
          </Form.Item>
        </Form>
      </Modal>}
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
            label="邮箱"
            rules={[
              { required: true },
              { pattern: ACCOUNT_EMAIL_PATTERN, message: ACCOUNT_EMAIL_HINT },
            ]}
          >
            <Input autoComplete="email" placeholder="QQ 邮箱或 name@751152.xyz" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
