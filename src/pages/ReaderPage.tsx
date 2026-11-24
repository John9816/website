import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CloudDownload,
  List,
  Minus,
  Plus,
  RotateCcw,
  Settings2,
  WifiOff,
  X,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { message } from 'antd'
import {
  getBookChapters,
  getBookContent,
  getBookDetail,
  type BookChapter,
  type BookView,
} from '../api/reading'
import {
  bookKey,
  clearProgress,
  DEFAULT_SETTINGS,
  loadProgress,
  loadSettings,
  saveProgress,
  saveSettings,
  type ReadingSettings,
  type ReadingTheme,
} from '../utils/readingStore'
import {
  bookCacheKey,
  chapterCacheKey,
  readChapter,
  writeChapter,
} from '../utils/bookCache'
import '../styles/reading.css'

const THEMES: { key: ReadingTheme; label: string; bg: string; fg: string }[] = [
  { key: 'paper', label: '纸张', bg: '#fbfaf6', fg: '#2b2b2b' },
  { key: 'sepia', label: '暖黄', bg: '#f5e9d0', fg: '#4a3b28' },
  { key: 'green', label: '护眼', bg: '#e3f0e4', fg: '#294031' },
  { key: 'night', label: '夜间', bg: '#1a1d1f', fg: '#c8ccd0' },
]

function themeColors(theme: ReadingTheme) {
  return THEMES.find((t) => t.key === theme) ?? THEMES[0]
}

export default function ReaderPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const sourceId = params.get('sourceId') || undefined
  const bookUrl = params.get('bookUrl') || ''
  const initialChapter = params.get('chapterUrl') || ''

  const [book, setBook] = useState<BookView | null>(null)
  const [chapters, setChapters] = useState<BookChapter[]>([])
  const [chapterUrl, setChapterUrl] = useState(initialChapter)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [fromCache, setFromCache] = useState(false)
  const [caching, setCaching] = useState(false)

  const [settings, setSettings] = useState<ReadingSettings>(() => loadSettings())
  const [showSettings, setShowSettings] = useState(false)
  const [showToc, setShowToc] = useState(false)
  const [restoredTip, setRestoredTip] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const storageKey = useMemo(() => bookKey(sourceId, bookUrl), [sourceId, bookUrl])
  const currentIndex = useMemo(
    () => chapters.findIndex((c) => c.url === chapterUrl),
    [chapters, chapterUrl],
  )

  // 加载书籍信息 + 目录
  useEffect(() => {
    if (!bookUrl) {
      setError('缺少书籍参数')
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    setError('')
    // Cache-first for book metadata + toc so the reader still opens offline.
    readChapter(bookCacheKey(sourceId, bookUrl)).then((cached) => {
      if (!alive || !cached) return
      if (cached.book) setBook(cached.book)
      if (cached.chapters) {
        setChapters(cached.chapters.list || [])
        if (!chapterUrl && cached.chapters.list?.length) setChapterUrl(cached.chapters.list[0].url)
      }
    })
    Promise.all([
      getBookDetail(sourceId, bookUrl),
      getBookChapters(sourceId, bookUrl),
    ])
      .then(([b, c]) => {
        if (!alive) return
        setBook(b)
        setChapters(c.list || [])
        if (!chapterUrl && c.list?.length) setChapterUrl(c.list[0].url)
        void writeChapter(bookCacheKey(sourceId, bookUrl), { content: { title: '', content: '', chapterUrl: '' }, book: b, chapters: c })
      })
      .catch((e) => {
        if (alive && !chapters.length) setError(e?.message || '加载书籍失败')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, bookUrl])

  // 恢复阅读进度（缓存命中或网络加载成功后都调用）
  const applyProgress = useCallback(() => {
    const progress = loadProgress(storageKey)
    if (progress && progress.chapterUrl === chapterUrl) {
      setRestoredTip(true)
      requestAnimationFrame(() => {
        const el = scrollRef.current
        if (el && progress.scrollRatio > 0) {
          el.scrollTop = el.scrollHeight * progress.scrollRatio
        }
      })
      setTimeout(() => setRestoredTip(false), 2600)
    } else {
      scrollRef.current?.scrollTo({ top: 0 })
    }
  }, [storageKey, chapterUrl])

  // 加载章节正文：缓存优先秒开，再后台刷新；离线时用缓存兜底。
  useEffect(() => {
    if (!chapterUrl) return
    let alive = true
    const key = chapterCacheKey(sourceId, bookUrl, chapterUrl)
    setError('')
    setFromCache(false)

    let cacheHit = false
    readChapter(key).then((cached) => {
      if (!alive || !cached) return
      cacheHit = true
      setTitle(cached.content.title || '')
      setContent(cached.content.content || '')
      setFromCache(true)
      setLoading(false)
      applyProgress()
    })

    setLoading(true)
    getBookContent(sourceId, bookUrl, chapterUrl)
      .then((data) => {
        if (!alive) return
        setTitle(data.title || '')
        setContent(data.content || '')
        setFromCache(false)
        setError('')
        void writeChapter(key, { content: data })
        if (!cacheHit) applyProgress()
      })
      .catch((e) => {
        if (!alive) return
        if (cacheHit) {
          // Offline / upstream failure but we have a cached copy: keep reading.
          setError('')
          void message.info('当前离线，正在阅读缓存章节')
        } else {
          setError(e?.message || '加载章节失败（无离线缓存）')
        }
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [sourceId, bookUrl, chapterUrl, applyProgress])

  // 保存进度（滚动时节流）
  const saveTimer = useRef<number | null>(null)
  const handleScroll = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      const el = scrollRef.current
      if (!el || !chapterUrl) return
      const ratio = el.scrollHeight > el.clientHeight ? el.scrollTop / el.scrollHeight : 0
      saveProgress(storageKey, {
        chapterUrl,
        chapterTitle: title,
        scrollRatio: ratio,
        updatedAt: Date.now(),
      })
    }, 400)
  }, [storageKey, chapterUrl, title])
  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
  }, [])

  const updateSettings = (patch: Partial<ReadingSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      saveSettings(next)
      return next
    })
  }

  const goChapter = (delta: number) => {
    const next = chapters[currentIndex + delta]
    if (next) {
      setChapterUrl(next.url)
      setShowToc(false)
    }
  }

  // 缓存从当前章开始的后续若干章，供离线阅读。串行 + 小延时避免压垮上游。
  const cacheForward = async (count: number) => {
    if (caching) return
    const start = currentIndex >= 0 ? currentIndex : 0
    const targets = chapters.slice(start, start + count)
    if (!targets.length) {
      message.warning('没有可缓存的章节')
      return
    }
    setCaching(true)
    let ok = 0
    const hide = message.loading(`正在缓存 ${targets.length} 章…`, 0)
    try {
      for (const c of targets) {
        try {
          const data = await getBookContent(sourceId, bookUrl, c.url)
          const saved = await writeChapter(chapterCacheKey(sourceId, bookUrl, c.url), { content: data })
          if (saved) ok++
        } catch {
          // skip chapters that fail to parse; keep going
        }
      }
      hide()
      message.success(`已缓存 ${ok}/${targets.length} 章，可离线阅读`)
    } finally {
      hide()
      setCaching(false)
    }
  }

  const colors = themeColors(settings.theme)

  const paragraphs = useMemo(() => {
    return content
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
  }, [content])

  if (!bookUrl) {
    return (
      <div className="reader-page reader-empty">
        <p>书籍链接无效。</p>
        <button type="button" onClick={() => navigate('/reading')}>返回书城</button>
      </div>
    )
  }

  return (
    <div
      className="reader-page"
      style={{ ['--reader-bg' as string]: colors.bg, ['--reader-fg' as string]: colors.fg }}
    >
      <header className="reader-topbar">
        <button type="button" className="reader-icon-btn" onClick={() => navigate(-1)} aria-label="返回">
          <ArrowLeft size={20} />
        </button>
        <div className="reader-topbar-title">
          <span>{book?.name || '阅读'}</span>
          <small>{title}</small>
        </div>
        <div className="reader-topbar-actions">
          {fromCache && (
            <span className="reader-offline-badge" title="当前显示离线缓存内容">
              <WifiOff size={13} /> 离线
            </span>
          )}
          <button type="button" className="reader-icon-btn" onClick={() => setShowToc(true)} aria-label="目录">
            <List size={20} />
          </button>
          <button type="button" className="reader-icon-btn" onClick={() => setShowSettings(true)} aria-label="阅读设置">
            <Settings2 size={20} />
          </button>
        </div>
      </header>

      {restoredTip && <div className="reader-toast">已恢复到上次阅读位置</div>}

      <div
        className="reader-scroll"
        ref={scrollRef}
        onScroll={handleScroll}
        onClick={(e) => {
          if (settings.turnMode !== 'tap') return
          const el = scrollRef.current
          if (!el) return
          const x = e.clientX - el.getBoundingClientRect().left
          const w = el.clientWidth
          if (x < w * 0.3) goChapter(-1)
          else if (x > w * 0.7) goChapter(1)
        }}
      >
        <div
          className="reader-article"
          style={{
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lineHeight,
            paddingLeft: `${settings.pagePadding}px`,
            paddingRight: `${settings.pagePadding}px`,
          }}
        >
          {loading && <div className="reader-loading">正在加载章节…</div>}
          {error && <div className="reader-error">{error}</div>}
          {!loading && !error && (
            <>
              <h1 className="reader-chapter-title">{title}</h1>
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {paragraphs.length === 0 && <p className="reader-muted">本章暂无内容</p>}
            </>
          )}
        </div>
      </div>

      <footer className="reader-bottombar">
        <button
          type="button"
          className="reader-nav-btn"
          disabled={currentIndex <= 0}
          onClick={() => goChapter(-1)}
        >
          <ChevronLeft size={16} /> 上一章
        </button>
        <span className="reader-progress-text">
          {currentIndex >= 0 ? `${currentIndex + 1} / ${chapters.length}` : '—'}
        </span>
        <button
          type="button"
          className="reader-nav-btn"
          disabled={currentIndex < 0 || currentIndex >= chapters.length - 1}
          onClick={() => goChapter(1)}
        >
          下一章 <ChevronRight size={16} />
        </button>
      </footer>

      {/* 目录抽屉 */}
      {showToc && (
        <div className="reader-drawer-mask" onClick={() => setShowToc(false)}>
          <aside className="reader-toc" onClick={(e) => e.stopPropagation()}>
            <div className="reader-drawer-head">
              <strong>目录</strong>
              <button type="button" className="reader-icon-btn" onClick={() => setShowToc(false)} aria-label="关闭">
                <X size={18} />
              </button>
            </div>
            <div className="reader-toc-list">
              {chapters.map((c, i) => (
                <button
                  type="button"
                  key={`${c.url}-${i}`}
                  className={`reader-toc-item ${c.url === chapterUrl ? 'active' : ''}`}
                  onClick={() => {
                    setChapterUrl(c.url)
                    setShowToc(false)
                  }}
                >
                  <span>{c.title}</span>
                </button>
              ))}
              {chapters.length === 0 && <p className="reader-muted">暂无目录</p>}
            </div>
          </aside>
        </div>
      )}

      {/* 设置面板 */}
      {showSettings && (
        <div className="reader-drawer-mask" onClick={() => setShowSettings(false)}>
          <aside className="reader-settings" onClick={(e) => e.stopPropagation()}>
            <div className="reader-drawer-head">
              <strong>阅读设置</strong>
              <button type="button" className="reader-icon-btn" onClick={() => setShowSettings(false)} aria-label="关闭">
                <X size={18} />
              </button>
            </div>

            <div className="reader-setting-row">
              <label>字号</label>
              <div className="reader-stepper">
                <button type="button" onClick={() => updateSettings({ fontSize: Math.max(14, settings.fontSize - 1) })} aria-label="减小字号">
                  <Minus size={16} />
                </button>
                <span>{settings.fontSize}</span>
                <button type="button" onClick={() => updateSettings({ fontSize: Math.min(34, settings.fontSize + 1) })} aria-label="增大字号">
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <div className="reader-setting-row">
              <label>行距</label>
              <div className="reader-stepper">
                <button type="button" onClick={() => updateSettings({ lineHeight: Math.max(1.4, +(settings.lineHeight - 0.1).toFixed(1)) })} aria-label="减小行距">
                  <Minus size={16} />
                </button>
                <span>{settings.lineHeight}</span>
                <button type="button" onClick={() => updateSettings({ lineHeight: Math.min(2.6, +(settings.lineHeight + 0.1).toFixed(1)) })} aria-label="增大行距">
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <div className="reader-setting-row">
              <label>页边距</label>
              <div className="reader-stepper">
                <button type="button" onClick={() => updateSettings({ pagePadding: Math.max(0, settings.pagePadding - 4) })} aria-label="减小边距">
                  <Minus size={16} />
                </button>
                <span>{settings.pagePadding}</span>
                <button type="button" onClick={() => updateSettings({ pagePadding: Math.min(48, settings.pagePadding + 4) })} aria-label="增大边距">
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <div className="reader-setting-block">
              <label>背景主题</label>
              <div className="reader-theme-grid">
                {THEMES.map((t) => (
                  <button
                    type="button"
                    key={t.key}
                    className={`reader-theme-swatch ${settings.theme === t.key ? 'active' : ''}`}
                    style={{ ['--swatch-bg' as string]: t.bg, ['--swatch-fg' as string]: t.fg }}
                    onClick={() => updateSettings({ theme: t.key })}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="reader-setting-block">
              <label>翻页方式</label>
              <div className="reader-segment">
                <button
                  type="button"
                  className={settings.turnMode === 'scroll' ? 'active' : ''}
                  onClick={() => updateSettings({ turnMode: 'scroll' })}
                >
                  上下滑动
                </button>
                <button
                  type="button"
                  className={settings.turnMode === 'tap' ? 'active' : ''}
                  onClick={() => updateSettings({ turnMode: 'tap' })}
                >
                  左右点击
                </button>
              </div>
            </div>

            <div className="reader-setting-block">
              <label>离线缓存</label>
              <p className="reader-setting-hint">缓存章节后，无网络也能继续阅读。缓存保存在本机。</p>
              <div className="reader-cache-actions">
                <button type="button" disabled={caching} onClick={() => cacheForward(10)}>
                  <CloudDownload size={14} /> 后续10章
                </button>
                <button type="button" disabled={caching} onClick={() => cacheForward(30)}>
                  <CloudDownload size={14} /> 后续30章
                </button>
              </div>
            </div>

            <div className="reader-setting-actions">
              <button
                type="button"
                className="reader-text-btn"
                onClick={() => updateSettings({ ...DEFAULT_SETTINGS })}
              >
                <RotateCcw size={14} /> 恢复默认
              </button>
              <button
                type="button"
                className="reader-text-btn danger"
                onClick={() => clearProgress(storageKey)}
              >
                清除本书进度
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
