import { useEffect, useRef, useState } from 'react'
import { App as AntApp, Image } from 'antd'
import {
  Copy,
  Download,
  LoaderCircle,
  RefreshCw,
  SendHorizontal,
  Sparkles,
  StopCircle,
  Trash2,
  X,
} from 'lucide-react'
import {
  adminDeleteImageHistory,
  adminGenerateImage,
  adminListImageHistory,
} from '../api/admin'
import { DEFAULT_PAGE_SIZE } from '../constants/pagination'
import type { GeneratedImageView, ImageGenerateResult } from '../types'
import '../styles/admin-image.css'

const MAX_PROMPT = 2000

export default function AdminImage() {
  const { message } = AntApp.useApp()
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<ImageGenerateResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [items, setItems] = useState<GeneratedImageView[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const loadHistory = async (p = page) => {
    setHistoryLoading(true)
    try {
      const data = await adminListImageHistory(p - 1, DEFAULT_PAGE_SIZE)
      setItems(data.items)
      setTotal(data.total)
      setPage(p)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    loadHistory(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!loading) return
    setElapsed(0)
    const started = Date.now()
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000))
    }, 500)
    return () => window.clearInterval(id)
  }, [loading])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const handleGenerate = async () => {
    const text = prompt.trim()
    if (!text) {
      message.warning('请输入提示词')
      return
    }

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setResult(null)
    try {
      const data = await adminGenerateImage(text, ctrl.signal)
      setResult(data)
      message.success('生成成功')
      loadHistory(1)
    } catch (e) {
      const err = e as Error & { code?: number }
      if (err.code === -2) {
        message.info('已取消生成')
      } else {
        message.error(err.message)
      }
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }

  const handleCancel = () => {
    abortRef.current?.abort()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      void handleGenerate()
    }
  }

  const handleReuse = (p: string) => {
    setPrompt(p)
  }

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      message.success('已复制提示词')
    } catch {
      message.error('复制失败')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await adminDeleteImageHistory(id)
      message.success('已删除')
      setItems((prev) => prev.filter((item) => item.id !== id))
      setTotal((prev) => prev - 1)
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const formatTime = (v: string) => {
    if (!v) return ''
    const d = new Date(v.replace(' ', 'T'))
    if (Number.isNaN(d.getTime())) return v
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const ts = d.getTime()
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    if (ts >= today) return `${hh}:${mm}`
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${mo}-${dd} ${hh}:${mm}`
  }

  return (
    <div className="admin-image">
      {/* Left panel */}
      <div className="admin-image__left">
        <div>
          <h1 className="admin-image__title">
            <Sparkles size={20} />
            图片生成
          </h1>
          <p className="admin-image__subtitle">
            输入描述性提示词，AI 将为你生成图像。生成过程约 30 秒至 3 分钟。
          </p>
        </div>

        <div className="admin-image__form">
          <label className="admin-image__label">提示词 (Prompt)</label>
          <textarea
            className="admin-image__textarea"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="例如：a beautiful sunset over the ocean, cinematic lighting, 8k resolution..."
            maxLength={MAX_PROMPT}
            disabled={loading}
          />
          <div className="admin-image__char-count">
            {prompt.length} / {MAX_PROMPT}
          </div>
        </div>

        <div className="admin-image__actions">
          {loading ? (
            <>
              <button
                type="button"
                className="admin-image__btn admin-image__btn--primary"
                disabled
              >
                <LoaderCircle size={16} className="admin-image__spinner" />
                生成中 {elapsed}s...
              </button>
              <button
                type="button"
                className="admin-image__btn admin-image__btn--danger"
                onClick={handleCancel}
              >
                <StopCircle size={16} />
                取消
              </button>
            </>
          ) : (
            <button
              type="button"
              className="admin-image__btn admin-image__btn--primary"
              onClick={() => void handleGenerate()}
              disabled={!prompt.trim()}
            >
              <SendHorizontal size={16} />
              开始生成
            </button>
          )}
        </div>

        {/* Current result */}
        {result && (
          <div className="admin-image__result">
            <div className="admin-image__result-head">
              <span>生成结果</span>
              <span className="admin-image__result-model">{result.model}</span>
            </div>
            {result.imageUrl ? (
              <Image
                src={result.imageUrl}
                alt="generated"
                className="admin-image__result-img"
                preview={{ mask: '查看大图' }}
              />
            ) : (
              <div className="admin-image__result-empty">未返回图片 URL</div>
            )}
          </div>
        )}
      </div>

      {/* Right panel */}
      <div className="admin-image__right">
        <div className="admin-image__gallery-head">
          <h3>生成历史 {total > 0 && `(${total})`}</h3>
          <button
            type="button"
            className="admin-image__refresh-btn"
            onClick={() => loadHistory(page)}
            disabled={historyLoading}
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>

        <div className="admin-image__gallery">
          {historyLoading && !items.length ? (
            <div className="admin-image__grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="admin-image__skeleton-card">
                  <div className="admin-image__skeleton-img" />
                  <div className="admin-image__skeleton-text" style={{ width: '70%' }} />
                  <div className="admin-image__skeleton-text" style={{ width: '40%', marginBottom: 12 }} />
                </div>
              ))}
            </div>
          ) : !items.length ? (
            <div className="admin-image__empty">
              <Sparkles size={32} />
              <p>还没有生成记录</p>
            </div>
          ) : (
            <>
              <div className="admin-image__grid">
                {items.map((item) => (
                  <div key={item.id} className="admin-image__card">
                    <div
                      className="admin-image__card-img-wrap"
                      onClick={() => item.imageUrl && setPreviewUrl(item.imageUrl)}
                    >
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.prompt}
                          className="admin-image__card-img"
                          loading="lazy"
                        />
                      ) : (
                        <div className="admin-image__result-empty" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          无图片
                        </div>
                      )}
                    </div>
                    <div className="admin-image__card-body">
                      <div className="admin-image__card-prompt" title={item.prompt}>
                        {item.prompt}
                      </div>
                      <div className="admin-image__card-footer">
                        <span className="admin-image__card-model">{item.model}</span>
                        <span className="admin-image__card-time">{formatTime(item.createdAt)}</span>
                        <div className="admin-image__card-actions">
                          <button
                            type="button"
                            className="admin-image__card-btn"
                            title="复用提示词"
                            onClick={() => handleReuse(item.prompt)}
                          >
                            <RefreshCw size={13} />
                          </button>
                          <button
                            type="button"
                            className="admin-image__card-btn"
                            title="复制提示词"
                            onClick={() => void handleCopy(item.prompt)}
                          >
                            <Copy size={13} />
                          </button>
                          <button
                            type="button"
                            className="admin-image__card-btn"
                            title="下载图片"
                            onClick={() => {
                              const a = document.createElement('a')
                              a.href = item.imageUrl
                              a.download = `image-${item.id}.png`
                              a.click()
                            }}
                          >
                            <Download size={13} />
                          </button>
                          <button
                            type="button"
                            className="admin-image__card-btn admin-image__card-btn--danger"
                            title="删除"
                            onClick={() => void handleDelete(item.id)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {total > DEFAULT_PAGE_SIZE && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0', gap: 8 }}>
                  {Array.from({ length: Math.ceil(total / DEFAULT_PAGE_SIZE) }).map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      className="admin-image__refresh-btn"
                      style={{
                        background: page === i + 1 ? 'var(--text)' : undefined,
                        color: page === i + 1 ? 'var(--bg)' : undefined,
                        borderColor: page === i + 1 ? 'var(--text)' : undefined,
                      }}
                      onClick={() => loadHistory(i + 1)}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Preview overlay */}
      {previewUrl && (
        <div
          className="admin-image__preview-overlay"
          onClick={() => setPreviewUrl(null)}
        >
          <button
            type="button"
            className="admin-image__preview-close"
            onClick={() => setPreviewUrl(null)}
          >
            <X size={20} />
          </button>
          <img src={previewUrl} alt="preview" className="admin-image__preview-img" />
        </div>
      )}
    </div>
  )
}
