import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Layers3, RefreshCw, BookOpen, LogIn } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/client'
import {
  discoverBooks,
  listBookSources,
  type BookSourceCatalog,
  type BookView,
} from '../../api/reading'
import { loadProgress, bookKey } from '../../utils/readingStore'
import AppShell from '../../components/AppShell'
import '../../styles/reading.css'

export default function BookCityPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [needLogin, setNeedLogin] = useState(false)
  const [sources, setSources] = useState<BookSourceCatalog[]>([])
  const [sourceId, setSourceId] = useState<string>('')
  const [discover, setDiscover] = useState<Awaited<ReturnType<typeof discoverBooks>> | null>(null)
  const [category, setCategory] = useState<string>('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [showSourcePicker, setShowSourcePicker] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listBookSources()
      .then((list) => {
        setSources(list || [])
        const first = (list || []).find((s) => s.operational) || list?.[0]
        if (first) setSourceId(first.id)
      })
      .catch((e) => {
        if (e instanceof ApiError && e.code === 401) setNeedLogin(true)
        setError(e?.message || '加载书源失败')
      })
  }, [])

  useEffect(() => {
    if (!sourceId) return
    let alive = true
    setLoading(true)
    setError('')
    discoverBooks({ sourceId, section: category ? 'category' : 'home', category: category || undefined, page })
      .then((data) => {
        if (alive) setDiscover(data)
      })
      .catch((e) => {
        if (alive) setError(e?.message || '加载书城失败')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [sourceId, category, page])

  const currentSource = useMemo(
    () => sources.find((s) => s.id === sourceId),
    [sources, sourceId],
  )

  const openBook = (book: BookView) => {
    navigate(`/reading/detail?sourceId=${encodeURIComponent(book.sourceId || sourceId)}&bookUrl=${encodeURIComponent(book.bookUrl)}`)
  }

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const kw = keyword.trim()
    if (kw) navigate(`/reading/search?keyword=${encodeURIComponent(kw)}&sourceId=${encodeURIComponent(sourceId)}`)
  }

  return (
    <AppShell>
      <div className="reading-page">
        <header className="reading-header">
          <div className="reading-header-top">
            <div className="reading-brand">
              <BookOpen size={22} />
              <span>在线阅读</span>
            </div>
            <Link to="/reading/sources" className="reading-source-link">
              <Layers3 size={16} /> 书源管理
            </Link>
          </div>
          <form className="reading-search" onSubmit={submitSearch}>
            <Search size={18} />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索书名、作者…"
              aria-label="搜索书籍"
            />
            <button type="submit">搜索</button>
          </form>
          <div className="reading-source-bar">
            <button type="button" className="reading-source-current" onClick={() => setShowSourcePicker((v) => !v)}>
              {currentSource?.name || '选择书源'} <span>▾</span>
            </button>
            <button type="button" className="reading-refresh" onClick={() => { setPage(1); setCategory(''); setDiscover(null); setLoading(true); discoverBooks({ sourceId, page: 1 }).then(setDiscover).finally(() => setLoading(false)) }} aria-label="刷新">
              <RefreshCw size={16} />
            </button>
            {showSourcePicker && (
              <div className="reading-source-menu">
                {sources.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    className={s.id === sourceId ? 'active' : ''}
                    onClick={() => {
                      setSourceId(s.id)
                      setCategory('')
                      setPage(1)
                      setShowSourcePicker(false)
                    }}
                  >
                    <span>{s.name}</span>
                    <small>{s.operational ? '可用' : s.status}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        <div className="reading-body" ref={listRef}>
          {!!discover?.categories?.length && (
            <div className="reading-categories">
              <button
                type="button"
                className={!category ? 'active' : ''}
                onClick={() => { setCategory(''); setPage(1) }}
              >
                推荐
              </button>
              {discover.categories.map((c) => (
                <button
                  type="button"
                  key={c.key}
                  className={category === c.key ? 'active' : ''}
                  onClick={() => { setCategory(c.key); setPage(1) }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div className="reading-error">
              <p>{needLogin ? '登录后即可使用在线阅读' : error}</p>
              {needLogin && (
                <button
                  type="button"
                  className="book-primary-btn reading-login-btn"
                  onClick={() => navigate('/login', { state: { from: location.pathname + location.search } })}
                >
                  <LogIn size={16} /> 去登录
                </button>
              )}
            </div>
          )}

          {loading && <div className="reading-loading">正在加载书城…</div>}

          {!loading && discover?.sections?.map((section) => (
            <section className="reading-section" key={section.key}>
              <h2>{section.title}</h2>
              <div className="reading-grid">
                {section.books.map((book, i) => {
                  const progress = loadProgress(bookKey(book.sourceId || sourceId, book.bookUrl))
                  return (
                    <button type="button" className="reading-book-card" key={`${book.bookUrl}-${i}`} onClick={() => openBook(book)}>
                      <div className="reading-cover">
                        {book.coverUrl ? (
                          <img src={book.coverUrl} alt={book.name} loading="lazy" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="reading-cover-ph">{book.name.slice(0, 2)}</div>
                        )}
                        {progress && <span className="reading-progress-badge">续读</span>}
                      </div>
                      <div className="reading-book-meta">
                        <strong>{book.name}</strong>
                        <small>{book.author || '未知作者'}</small>
                        {book.latestChapter && <small className="reading-latest">{book.latestChapter}</small>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}

          {!loading && !error && !discover?.sections?.length && (
            <div className="reading-empty">该书源暂无内容，试试切换书源或搜索。</div>
          )}

          {discover && discover.sections?.length ? (
            <div className="reading-pager">
              <button type="button" disabled={page <= 1} onClick={() => { setPage((p) => Math.max(1, p - 1)); listRef.current?.scrollTo({ top: 0 }) }}>上一页</button>
              <span>第 {page} 页</span>
              <button type="button" onClick={() => { setPage((p) => p + 1); listRef.current?.scrollTo({ top: 0 }) }}>下一页</button>
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  )
}
