import { useEffect, useState } from 'react'
import { App as AntApp } from 'antd'
import { LoaderCircle, LogIn, RefreshCw, Settings, Sparkles } from 'lucide-react'
import { Link as RouterLink, NavLink as RouterNavLink } from 'react-router-dom'
import { listSharedImages } from '../api/public'
import ImageStudio from '../components/ImageStudio'
import ImagePreviewOverlay from '../components/ImagePreviewOverlay'
import TopbarUserMenu from '../components/TopbarUserMenu'
import ThemeToggle from '../components/ThemeToggle'
import { DEFAULT_PAGE_SIZE } from '../constants/pagination'
import { useAuth } from '../context/AuthContext'
import type { GeneratedImageView } from '../types'
import '../styles/topbar.css'
import '../styles/ai-chat.css'
import '../styles/admin-image.css'
import '../styles/ai-image.css'

const SHARED_PAGE_SIZE = Math.min(DEFAULT_PAGE_SIZE, 12)

export default function AiImagePage() {
  const { message } = AntApp.useApp()
  const auth = useAuth()
  const mainClassName = `ai-chat__main${auth.token ? ' ai-chat__main--authenticated' : ''}`
  const [sharedItems, setSharedItems] = useState<GeneratedImageView[]>([])
  const [sharedTotal, setSharedTotal] = useState(0)
  const [sharedPage, setSharedPage] = useState(1)
  const [sharedLoading, setSharedLoading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const loadShared = async (nextPage = sharedPage) => {
    setSharedLoading(true)
    try {
      const data = await listSharedImages(nextPage - 1, SHARED_PAGE_SIZE)
      setSharedItems(data.items)
      setSharedTotal(data.total)
      setSharedPage(nextPage)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSharedLoading(false)
    }
  }

  useEffect(() => {
    if (auth.token) return
    void loadShared(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token])

  return (
    <div className="ai-chat">
      <header className="topbar">
        <RouterLink to="/" className="topbar-brand" aria-label="返回首页">
          <span className="brand-dot" />
          <span>我的导航</span>
        </RouterLink>

        <nav className="topbar-nav" aria-label="主导航">
          <RouterNavLink
            to="/"
            end
            className={({ isActive }) => `topbar-nav__link${isActive ? ' is-active' : ''}`}
          >
            导航
          </RouterNavLink>
          <RouterNavLink
            to="/music"
            className={({ isActive }) => `topbar-nav__link${isActive ? ' is-active' : ''}`}
          >
            音乐
          </RouterNavLink>
          <RouterNavLink
            to="/ai-chat"
            className={({ isActive }) => `topbar-nav__link${isActive ? ' is-active' : ''}`}
          >
            AI对话
          </RouterNavLink>
          <RouterNavLink
            to="/ai-image"
            className={({ isActive }) => `topbar-nav__link${isActive ? ' is-active' : ''}`}
          >
            AI生图
          </RouterNavLink>
        </nav>

        <div className="topbar-actions" aria-label="站点操作">
          {auth.token ? (
            <RouterLink to="/admin" className="topbar-action">
              <Settings size={16} />
              <span>管理</span>
            </RouterLink>
          ) : (
            <RouterLink to="/login" className="topbar-action" state={{ from: '/ai-image' }}>
              <LogIn size={16} />
              <span>登录</span>
            </RouterLink>
          )}
          <ThemeToggle />
          {auth.token && <TopbarUserMenu />}
        </div>
      </header>

      <main className={mainClassName}>
        {auth.token ? (
          <ImageStudio layout="standalone" />
        ) : (
          <div className="ai-image-page__guest">
            <section className="ai-image-page__hero">
              <article className="ai-chat__welcome-card">
                <div className="ai-chat__eyebrow">
                  <Sparkles size={14} />
                  <span>AI Image</span>
                </div>
                <h1>AI 生图工作台</h1>
                <p>支持多尺寸、多图并发生成，还能把满意的作品公开到分享广场。</p>
              </article>

              <article className="ai-chat__login-card">
                <div className="ai-chat__icon-badge">
                  <Sparkles size={18} />
                </div>
                <h2>登录后开始生图</h2>
                <p>使用站内账号登录即可进入生成页面，并管理自己的生图历史。</p>
                <div className="ai-chat__guest-actions">
                  <RouterLink
                    to="/login"
                    state={{ from: '/ai-image' }}
                    className="ai-chat__button ai-chat__button--primary"
                  >
                    <LogIn size={16} />
                    <span>去登录</span>
                  </RouterLink>
                  <RouterLink
                    to="/register"
                    className="ai-chat__button ai-chat__button--secondary"
                  >
                    注册账号
                  </RouterLink>
                </div>
              </article>
            </section>

            <section className="ai-image-page__shared">
              <div className="ai-image-page__shared-head">
                <div>
                  <div className="ai-chat__eyebrow">
                    <Sparkles size={14} />
                    <span>Public Share</span>
                  </div>
                  <h2>公开分享广场</h2>
                  <p>这里会展示用户主动公开的图片作品。登录后你也可以把自己的图片发布到这里。</p>
                </div>
                <button
                  type="button"
                  className="admin-image__refresh-btn"
                  onClick={() => void loadShared(sharedPage)}
                  disabled={sharedLoading}
                >
                  {sharedLoading ? (
                    <LoaderCircle size={14} className="admin-image__spinner" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  刷新
                </button>
              </div>

              {sharedLoading && !sharedItems.length ? (
                <div className="admin-image__grid">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="admin-image__skeleton-card">
                      <div className="admin-image__skeleton-img" />
                      <div className="admin-image__skeleton-text" style={{ width: '70%' }} />
                      <div
                        className="admin-image__skeleton-text"
                        style={{ width: '40%', marginBottom: 12 }}
                      />
                    </div>
                  ))}
                </div>
              ) : !sharedItems.length ? (
                <div className="ai-image-page__shared-empty">
                  <Sparkles size={30} />
                  <p>还没有公开分享的图片。</p>
                </div>
              ) : (
                <>
                  <div className="admin-image__grid">
                    {sharedItems.map((item) => (
                      <div key={item.id} className="admin-image__card">
                        <div
                          className="admin-image__card-img-wrap"
                          onClick={() => item.imageUrl && setPreviewUrl(item.imageUrl)}
                        >
                          <img
                            src={item.imageUrl}
                            alt={item.prompt}
                            className="admin-image__card-img"
                            loading="lazy"
                          />
                        </div>
                        <div className="admin-image__card-body">
                          <div className="admin-image__card-prompt" title={item.prompt}>
                            {item.prompt}
                          </div>
                          <div className="admin-image__card-meta">
                            <span className="admin-image__card-model">{item.model}</span>
                            {item.size && (
                              <span className="admin-image__card-chip">{item.size}</span>
                            )}
                            <span className="admin-image__card-chip admin-image__card-chip--shared">
                              公开作品
                            </span>
                          </div>
                          <div className="admin-image__card-footer">
                            <span className="admin-image__card-time">
                              {formatTime(item.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {sharedTotal > SHARED_PAGE_SIZE && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'center',
                        padding: '20px 0 0',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      {Array.from({ length: Math.ceil(sharedTotal / SHARED_PAGE_SIZE) }).map(
                        (_, index) => (
                          <button
                            key={index}
                            type="button"
                            className="admin-image__refresh-btn"
                            style={{
                              background: sharedPage === index + 1 ? 'var(--text)' : undefined,
                              color: sharedPage === index + 1 ? 'var(--bg)' : undefined,
                              borderColor:
                                sharedPage === index + 1 ? 'var(--text)' : undefined,
                            }}
                            onClick={() => void loadShared(index + 1)}
                          >
                            {index + 1}
                          </button>
                        ),
                      )}
                    </div>
                  )}
                </>
              )}
            </section>

            {previewUrl && (
              <ImagePreviewOverlay src={previewUrl} onClose={() => setPreviewUrl(null)} />
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function formatTime(value: string) {
  if (!value) return ''
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return value
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const time = date.getTime()
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  if (time >= today) return `${hh}:${mm}`
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}-${day} ${hh}:${mm}`
}
