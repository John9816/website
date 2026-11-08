import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Modal, Space, Spin, Tag } from 'antd'
import { QrCode } from 'lucide-react'
import { getAuthSessionId } from '../../api/client'
import { createQishuiQr, deleteQishuiAccount, getQishuiAccount, pollQishuiQr, refreshQishuiAccount } from '../../api/music'
import { useAuth } from '../../context/AuthContext'
import type { QishuiAccountView } from '../../types'
import './qishui-account.css'

const statusText: Record<string, string> = {
  new: '请使用抖音扫描二维码，并确认授权',
  scanned: '已扫码，请在手机上确认授权',
  confirmed: '黑源账号已绑定',
  refused: '你已取消授权，可以重新获取二维码',
  expired: '二维码已过期，请重新获取',
  failed: '授权未完成，请重新扫码',
}

function accountError(error: unknown) {
  const e = error as { code?: number; message?: string }
  if (e?.code === 1003) return '黑源授权服务暂未就绪，请稍后再试。'
  if (e?.code === 404) return '二维码会话已失效，请重新获取。'
  if (e?.code === 1013 || e?.code === 429) return '操作较频繁，请稍后重试。'
  return e?.message || '暂时无法获取授权状态，请重试。'
}

export default function QishuiAccountControl() {
  const auth = useAuth()
  if (!auth.token) return null
  return <AccountControl key={getAuthSessionId() || 'signed-out'} />
}

function AccountControl() {
  const [open, setOpen] = useState(false)
  const [account, setAccount] = useState<QishuiAccountView | null>(null)
  const [session, setSession] = useState<QishuiAccountView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const version = useRef(0)

  const cancel = useCallback(() => {
    version.current += 1
    controller.current?.abort()
    controller.current = null
  }, [])

  const run = useCallback(async (
    operation: (signal: AbortSignal) => Promise<QishuiAccountView>,
    apply: (view: QishuiAccountView) => void,
  ) => {
    cancel()
    const current = version.current
    const request = new AbortController()
    controller.current = request
    setBusy(true)
    setError('')
    try {
      const value = await operation(request.signal)
      if (current === version.current && !request.signal.aborted) apply(value)
    } catch (cause) {
      if (current === version.current && !request.signal.aborted) setError(accountError(cause))
    } finally {
      if (current === version.current) {
        controller.current = null
        setBusy(false)
      }
    }
  }, [cancel])

  useEffect(() => {
    if (!open) return
    setAccount(null)
    setSession(null)
    void run(getQishuiAccount, setAccount)
    return cancel
  }, [cancel, open, run])

  useEffect(() => {
    if (!open || !session?.sessionId || !['new', 'scanned'].includes(session.status) || busy || error) return
    const id = session.sessionId
    const timer = window.setTimeout(() => {
      if (session.sessionExpiresAt && Date.parse(session.sessionExpiresAt) <= Date.now()) {
        setSession(previous => previous ? { ...previous, status: 'expired' } : null)
        return
      }
      void run(signal => pollQishuiQr(id, signal), value => {
        setSession(previous => ({ ...previous, ...value }))
        if (value.status === 'confirmed') setAccount({ ...value, status: 'bound' })
      })
    }, Math.max(2, session.pollIntervalSeconds || 2) * 1000)
    return () => window.clearTimeout(timer)
  }, [busy, error, open, run, session])

  const close = () => {
    cancel()
    setOpen(false)
    setSession(null)
    setBusy(false)
    setError('')
  }
  const pending = session && ['new', 'scanned'].includes(session.status)
  const qrImage = pending && session.qrcode && /^iVBOR[A-Za-z0-9+/=\r\n]+$/.test(session.qrcode)
    ? `data:image/png;base64,${session.qrcode}` : null

  return <>
    <Button icon={<QrCode size={16} />} onClick={() => setOpen(true)}>黑源授权</Button>
    <Modal title="汽水音乐（黑源）授权" open={open} onCancel={close} footer={null} destroyOnClose width={440}>
      <div className="qishui-account">
        <p>每个网站账号独立扫码绑定。个人授权用于账号功能，歌曲搜索无需扫码。</p>
        {error && <Alert type="warning" showIcon message={error} />}
        {busy && !account && !session && <Spin aria-label="正在查询授权" />}
        {account?.bound && <div className="qishui-account__profile">
          <strong>{account.nickname || '已绑定汽水账号'}</strong>
          <Tag color={account.status === 'expired' ? 'orange' : 'green'}>{account.status === 'expired' ? '授权已过期' : '已绑定'}</Tag>
          {account.vip && <Tag>汽水会员</Tag>}
          {account.expiresAt && <small>授权有效期至 {new Date(account.expiresAt).toLocaleString()}</small>}
        </div>}
        {account?.status === 'unbound' && !session && <span>尚未绑定汽水账号</span>}
        {qrImage && <img className="qishui-account__qr" src={qrImage} alt="汽水音乐授权二维码" />}
        {session && <p role="status">{statusText[session.status] || '正在查询授权状态'}</p>}
        <Space wrap>
          <Button type="primary" loading={busy && !pending} disabled={busy} onClick={() => {
            setSession(null)
            void run(createQishuiQr, setSession)
          }}>{session ? '重新获取二维码' : account?.bound ? '重新扫码绑定' : '获取授权二维码'}</Button>
          {pending && error && <Button disabled={busy} onClick={() => setError('')}>重试查询</Button>}
          {account?.bound && <>
            <Button disabled={busy} onClick={() => {
              setSession(null)
              void run(refreshQishuiAccount, setAccount)
            }}>刷新授权</Button>
            <Button danger disabled={busy} onClick={() => {
              setSession(null)
              void run(async signal => {
                await deleteQishuiAccount(signal)
                return { bound: false, status: 'unbound' }
              }, setAccount)
            }}>解除绑定</Button>
          </>}
        </Space>
      </div>
    </Modal>
  </>
}
