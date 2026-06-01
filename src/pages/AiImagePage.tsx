import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import { App as AntApp } from 'antd'
import { ImageIcon, LoaderCircle, LogIn, RefreshCw, Sparkles } from 'lucide-react'
import { Link as RouterLink } from 'react-router-dom'
import { listSharedImages } from '../api/public'
import ImageStudio from '../components/ImageStudio'
import ImagePreviewOverlay from '../components/ImagePreviewOverlay'
import TopbarNav from '../components/TopbarNav'
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
  const pageClassName = `ai-chat${auth.token ? ' ai-chat--image-authenticated' : ''}`
  const [sharedItems, setSharedItems] = useState<GeneratedImageView[]>([])
  const [sharedTotal, setSharedTotal] = useState(0)
  const [sharedPage, setSharedPage] = useState(1)
  const [sharedLoading, setSharedLoading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(sharedTotal / SHARED_PAGE_SIZE)),
    [sharedTotal],
  )

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
    <div className={pageClassName}>
      {!auth.token && (
        <header className="topbar">
          <RouterLink to="/" className="topbar-brand" aria-label="返回首页">
            <span className="brand-dot" />
            <span>我的导航</span>
          </RouterLink>

          <TopbarNav />

          <div className="topbar-actions" aria-label="站点操作">
            <RouterLink to="/login" className="topbar-action" state={{ from: '/ai-image' }}>
              <LogIn size={16} />
              <span>登录</span>
            </RouterLink>
            <ThemeToggle />
          </div>
        </header>
      )}

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

            <section className="ai-image-page__shared" aria-labelledby="shared-gallery-title">
              <div className="ai-image-page__shared-head">
                <div>
                  <div className="ai-chat__eyebrow">
                    <ImageIcon size={14} />
                    <span>Public Share</span>
                  </div>
                  <h2 id="shared-gallery-title">公开分享广场</h2>
                  <p>这里展示用户主动公开的图片作品。登录后，你也可以把自己的作品发布到这里。</p>
                </div>
                <button
                  type="button"
                  className="ai-image-page__refresh"
                  onClick={() => void loadShared(sharedPage)}
                  disabled={sharedLoading}
                >
                  {sharedLoading ? (
                    <LoaderCircle size={15} className="admin-image__spinner" />
                  ) : (
                    <RefreshCw size={15} />
                  )}
                  <span>刷新</span>
                </button>
              </div>

              <div className="ai-image-page__shared-toolbar">
                <span>{sharedTotal ? `${sharedTotal} 张公开作品` : '公开作品'}</span>
                <span>点击图片可预览大图</span>
              </div>

              {sharedLoading && !sharedItems.length ? (
                <div className="ai-image-page__gallery" aria-label="公开图片加载中">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div key={index} className="ai-image-page__gallery-card is-loading">
                      <div className="ai-image-page__gallery-skeleton-image" />
                      <div className="ai-image-page__gallery-skeleton-line is-wide" />
                      <div className="ai-image-page__gallery-skeleton-line" />
                    </div>
                  ))}
                </div>
              ) : !sharedItems.length ? (
                <div className="ai-image-page__shared-empty">
                  <ImageIcon size={32} />
                  <p>还没有公开分享的图片。</p>
                </div>
              ) : (
                <>
                  <div className="ai-image-page__gallery">
                    {sharedItems.map((item) => (
                      <article key={item.id} className="ai-image-page__gallery-card">
                        {item.imageUrl ? (
                          <button
                            type="button"
                            className="ai-image-page__gallery-image"
                            style={imageAspectStyle(item.size)}
                            onClick={() => setPreviewUrl(item.imageUrl)}
                            aria-label={`预览图片：${item.prompt || '公开作品'}`}
                          >
                            <img src={item.imageUrl} alt={item.prompt || '公开图片'} loading="lazy" />
                          </button>
                        ) : (
                          <div className="ai-image-page__gallery-image ai-image-page__gallery-image--empty">
                            <ImageIcon size={28} />
                          </div>
                        )}
                        <div className="ai-image-page__gallery-body">
                          <p className="ai-image-page__gallery-prompt" title={item.prompt}>
                            {item.prompt || '未命名图片'}
                          </p>
                          <div className="ai-image-page__gallery-meta">
                            <span>{item.model || 'image model'}</span>
                            {item.size && <span>{item.size}</span>}
                            <span>公开作品</span>
                          </div>
                          <time className="ai-image-page__gallery-time" dateTime={item.createdAt}>
                            {formatTime(item.createdAt)}
                          </time>
                        </div>
                      </article>
                    ))}
                  </div>

                  {sharedTotal > SHARED_PAGE_SIZE && (
                    <nav className="ai-image-page__pagination" aria-label="公开图片分页">
                      {Array.from({ length: pageCount }).map((_, index) => {
                        const nextPage = index + 1
                        return (
                          <button
                            key={nextPage}
                            type="button"
                            className={sharedPage === nextPage ? 'is-active' : ''}
                            onClick={() => void loadShared(nextPage)}
                            aria-current={sharedPage === nextPage ? 'page' : undefined}
                          >
                            {nextPage}
                          </button>
                        )
                      })}
                    </nav>
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

function imageAspectStyle(size?: string | null): CSSProperties {
  const match = size?.match(/(\d+)\s*[xX*]\s*(\d+)/)
  if (!match) return { aspectRatio: '1 / 1' }
  const width = Number(match[1])
  const height = Number(match[2])
  if (!width || !height) return { aspectRatio: '1 / 1' }
  return { aspectRatio: `${width} / ${height}` }
}

function formatTime(value: string) {
  if (!value) return ''
  const date = new Date(`${value.replace(' ', 'T')}Z`)
  if (Number.isNaN(date.getTime())) return value
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const time = date.getTime()
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  if (time >= today) return `${hh}:${mm}:${ss}`
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}-${day} ${hh}:${mm}:${ss}`
}
