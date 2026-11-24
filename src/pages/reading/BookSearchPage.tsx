import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Search } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { searchBooks, type BookView } from '../../api/reading'
import AppShell from '../../components/AppShell'
import '../../styles/reading.css'

export default function BookSearchPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const initialKeyword = params.get('keyword') || ''
  const initialSource = params.get('sourceId') || undefined

  const [keyword, setKeyword] = useState(initialKeyword)
  const [sourceId] = useState<string | undefined>(initialSource)
  const [results, setResults] = useState<BookView[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const doSearch = (kw: string, p: number, append = false) => {
    if (!kw.trim()) return
    setLoading(true)
    setError('')
    searchBooks({ keyword: kw, page: p, sourceId })
      .then((data) => {
        setResults((prev) => (append ? [...prev, ...(data.list || [])] : data.list || []))
        setHasMore(data.hasMore)
        setSearched(true)
      })
      .catch((e) => setError(e?.message || '搜索失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (initialKeyword) doSearch(initialKeyword, 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 无限滚动加载更多
  useEffect(() => {
    if (!hasMore || !searched) return
    const node = sentinelRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading) {
          const next = page + 1
          setPage(next)
          doSearch(keyword, next, true)
        }
      },
      { rootMargin: '120px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, searched, loading, page, keyword])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!keyword.trim()) return
    setPage(1)
    setResults([])
    doSearch(keyword, 1)
  }

  const openBook = (book: BookView) => {
    navigate(`/reading/detail?sourceId=${encodeURIComponent(book.sourceId || sourceId || '')}&bookUrl=${encodeURIComponent(book.bookUrl)}`)
  }

  return (
    <AppShell>
      <div className="reading-page">
        <header className="reading-header">
          <div className="reading-header-top">
            <button type="button" className="reading-icon-btn" onClick={() => navigate(-1)} aria-label="返回">
              <ArrowLeft size={20} />
            </button>
            <span className="reading-page-title">搜索</span>
          </div>
          <form className="reading-search" onSubmit={submit}>
            <Search size={18} />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="输入书名或作者"
              aria-label="搜索关键词"
              autoFocus
            />
            <button type="submit">搜索</button>
          </form>
        </header>

        <div className="reading-body">
          {error && <div className="reading-error">{error}</div>}
          {loading && results.length === 0 && <div className="reading-loading">搜索中…</div>}
          {searched && !loading && results.length === 0 && !error && (
            <div className="reading-empty">没有找到相关书籍</div>
          )}

          <div className="reading-result-list">
            {results.map((book, i) => (
              <button type="button" className="reading-result-item" key={`${book.bookUrl}-${i}`} onClick={() => openBook(book)}>
                <div className="reading-result-cover">
                  {book.coverUrl ? (
                    <img src={book.coverUrl} alt={book.name} loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="reading-cover-ph">{book.name.slice(0, 2)}</div>
                  )}
                </div>
                <div className="reading-result-info">
                  <strong>{book.name}</strong>
                  <small>{book.author || '未知作者'}</small>
                  {book.intro && <p>{book.intro.slice(0, 60)}</p>}
                  <span className="reading-result-source">{book.sourceName}</span>
                </div>
              </button>
            ))}
          </div>
          <div ref={sentinelRef} className="reading-sentinel" />
          {loading && results.length > 0 && <div className="reading-loading">加载更多…</div>}
        </div>
      </div>
    </AppShell>
  )
}
