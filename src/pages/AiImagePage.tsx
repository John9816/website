import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import { App as AntApp } from 'antd'
import { Copy, ImageIcon, LoaderCircle, LogIn, RefreshCw, Sparkles } from 'lucide-react'
import { Link as RouterLink } from 'react-router-dom'
import { listSharedImages } from '../api/public'
import ImageStudio from '../components/ImageStudio'
import ImagePreviewOverlay from '../components/ImagePreviewOverlay'
import AppShell from '../components/AppShell'
import { DEFAULT_PAGE_SIZE } from '../constants/pagination'
import { useAuth } from '../context/AuthContext'
import type { GeneratedImageView } from '../types'
import { writeClipboardText } from '../utils/clipboard'
import '../styles/ai-chat.css'
import '../styles/admin-image.css'
import '../styles/ai-image.css'

const SHARED_PAGE_SIZE = Math.min(DEFAULT_PAGE_SIZE, 12)

export default function AiImagePage() {
  const { message } = AntApp.useApp()
  const auth = useAuth()
  const mainClassName = `ai-chat__main${auth.token ? ' ai-chat__main--authenticated' : ''}`
  const pageClassName = `ai-chat ai-image-page${auth.token ? ' ai-chat--image-authenticated' : ''}`
  const [sharedItems, setSharedItems] = useState<GeneratedImageView[]>([])
  const [sharedTotal, setSharedTotal] = useState(0)
  const [sharedPage, setSharedPage] = useState(1)
  const [sharedLoading, setSharedLoading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [failedSharedImageIds, setFailedSharedImageIds] = useState<Set<number>>(new Set())

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
      setFailedSharedImageIds(new Set())
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSharedLoading(false)
    }
  }

  const handleCopyPrompt = async (prompt?: string | null) => {
    const text = prompt?.trim()
    if (!text) {
      message.warning('没有可复制的提示词')
      return
    }
    try {
      await writeClipboardText(text)
      message.success('提示词已复制')
    } catch {
      message.error('复制失败，请手动复制提示词')
    }
  }

  useEffect(() => {
    if (auth.token) return
    void loadShared(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token])

  return (
    <AppShell>
      <div className={pageClassName}>
        <main className={mainClassName}>
        {auth.token ? (
          <ImageStudio layout="standalone" />
        ) : (
          <div className="ai-image-page__guest">
            <section className="ai-image-page__hero">
              <div className="ai-image-page__title">
                <div className="ai-chat__eyebrow">
                  <Sparkles size={14} />
                  <span>AI IMAGE</span>
                </div>
                <h1>AI 生图</h1>
              </div>
              <div className="ai-chat__guest-actions">
                <RouterLink
                  to="/login"
                  state={{ from: '/ai-image' }}
                  className="ai-chat__button ai-chat__button--primary"
                >
                  <LogIn size={16} />
                  <span>登录创作</span>
                </RouterLink>
                <RouterLink
                  to="/register"
                  className="ai-chat__button ai-chat__button--secondary"
                >
                  注册账号
                </RouterLink>
              </div>
            </section>

            <section className="ai-image-page__shared" aria-labelledby="shared-gallery-title">
              <div className="ai-image-page__shared-head">
                <div>
                  <h2 id="shared-gallery-title">公开作品 <span>{sharedTotal}</span></h2>
                </div>
                <button
                  type="button"
                  className="ai-image-page__refresh"
                  onClick={() => void loadShared(sharedPage)}
                  disabled={sharedLoading}
                  aria-label="刷新公开作品"
                  title="刷新公开作品"
                >
                  {sharedLoading ? (
                    <LoaderCircle size={15} className="admin-image__spinner" />
                  ) : (
                    <RefreshCw size={15} />
                  )}
                </button>
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
                        {item.imageUrl && !failedSharedImageIds.has(item.id) ? (
                          <button
                            type="button"
                            className="ai-image-page__gallery-image"
                            style={imageAspectStyle(item.size)}
                            onClick={() => setPreviewUrl(item.imageUrl)}
                            aria-label="预览公开作品"
                          >
                            <img
                              src={item.imageUrl}
                              alt={item.prompt || '公开作品'}
                              loading="lazy"
                              onError={() => {
                                setFailedSharedImageIds((current) => {
                                  const next = new Set(current)
                                  next.add(item.id)
                                  return next
                                })
                              }}
                            />
                          </button>
                        ) : (
                          <div className="ai-image-page__gallery-image ai-image-page__gallery-image--empty">
                            <ImageIcon size={28} />
                            <span>{item.imageUrl ? '原图已失效' : '暂无图片'}</span>
                          </div>
                        )}
                        <div className="ai-image-page__gallery-body">
                          <div className="ai-image-page__gallery-prompt-row">
                            <p className="ai-image-page__gallery-prompt" title={item.prompt}>
                              {item.prompt || '未命名图片'}
                            </p>
                            {item.prompt ? (
                              <button
                                type="button"
                                className="ai-image-page__copy-prompt"
                                onClick={() => void handleCopyPrompt(item.prompt)}
                                aria-label="复制提示词"
                                title="复制提示词"
                              >
                                <Copy size={15} />
                              </button>
                            ) : null}
                          </div>
                          <div className="ai-image-page__gallery-meta">
                            <span>{item.model || 'image model'}</span>
                            {item.size && <span>{item.size}</span>}
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
                            disabled={sharedLoading}
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
    </AppShell>
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
