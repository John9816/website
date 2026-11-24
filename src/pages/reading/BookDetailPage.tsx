import { useEffect, useState } from 'react'
import { ArrowLeft, BookOpen, List } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getBookChapters, getBookDetail, type BookChapter, type BookView } from '../../api/reading'
import { bookKey, loadProgress } from '../../utils/readingStore'
import AppShell from '../../components/AppShell'
import '../../styles/reading.css'

export default function BookDetailPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const sourceId = params.get('sourceId') || undefined
  const bookUrl = params.get('bookUrl') || ''

  const [book, setBook] = useState<BookView | null>(null)
  const [chapters, setChapters] = useState<BookChapter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!bookUrl) {
      setError('缺少书籍参数')
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    Promise.all([getBookDetail(sourceId, bookUrl), getBookChapters(sourceId, bookUrl)])
      .then(([b, c]) => {
        if (!alive) return
        setBook(b)
        setChapters(c.list || [])
      })
      .catch((e) => {
        if (alive) setError(e?.message || '加载失败')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [sourceId, bookUrl])

  const progress = loadProgress(bookKey(sourceId, bookUrl))
  const resumeChapter = progress
    ? chapters.find((c) => c.url === progress.chapterUrl)
    : null

  const read = (chapterUrl?: string) => {
    const q = new URLSearchParams()
    if (sourceId) q.set('sourceId', sourceId)
    q.set('bookUrl', bookUrl)
    if (chapterUrl) q.set('chapterUrl', chapterUrl)
    navigate(`/reading/read?${q.toString()}`)
  }

  return (
    <AppShell>
      <div className="reading-page">
        <header className="reading-header">
          <div className="reading-header-top">
            <button type="button" className="reading-icon-btn" onClick={() => navigate(-1)} aria-label="返回">
              <ArrowLeft size={20} />
            </button>
            <span className="reading-page-title">书籍详情</span>
          </div>
        </header>

        <div className="reading-body">
          {loading && <div className="reading-loading">加载中…</div>}
          {error && <div className="reading-error">{error}</div>}

          {book && (
            <div className="book-detail">
              <div className="book-detail-head">
                <div className="book-detail-cover">
                  {book.coverUrl ? (
                    <img src={book.coverUrl} alt={book.name} referrerPolicy="no-referrer" />
                  ) : (
                    <div className="reading-cover-ph big">{book.name.slice(0, 2)}</div>
                  )}
                </div>
                <div className="book-detail-meta">
                  <h1>{book.name}</h1>
                  <p className="book-detail-author">{book.author || '未知作者'}</p>
                  <div className="book-detail-tags">
                    {book.category && <span>{book.category}</span>}
                    {book.status && <span>{book.status}</span>}
                    <span>{book.sourceName}</span>
                  </div>
                  {book.latestChapter && <p className="book-detail-latest">最新：{book.latestChapter}</p>}
                </div>
              </div>

              {book.intro && (
                <div className="book-detail-intro">
                  <h3>简介</h3>
                  <p>{book.intro}</p>
                </div>
              )}

              <div className="book-detail-actions">
                {resumeChapter ? (
                  <button type="button" className="book-primary-btn" onClick={() => read(resumeChapter.url)}>
                    <BookOpen size={18} /> 继续阅读 · {resumeChapter.title}
                  </button>
                ) : (
                  <button type="button" className="book-primary-btn" onClick={() => read()}>
                    <BookOpen size={18} /> 开始阅读
                  </button>
                )}
                <button
                  type="button"
                  className="book-secondary-btn"
                  onClick={() => navigate(`/reading/toc?sourceId=${encodeURIComponent(sourceId || '')}&bookUrl=${encodeURIComponent(bookUrl)}`)}
                >
                  <List size={18} /> 目录（{chapters.length}）
                </button>
              </div>

              <div className="book-detail-chapters">
                <h3>最近章节</h3>
                {chapters.slice(0, 12).map((c, i) => (
                  <button type="button" key={`${c.url}-${i}`} onClick={() => read(c.url)}>
                    <span>{c.title}</span>
                  </button>
                ))}
                {chapters.length > 12 && (
                  <button type="button" className="book-more-chapters" onClick={() => navigate(`/reading/toc?sourceId=${encodeURIComponent(sourceId || '')}&bookUrl=${encodeURIComponent(bookUrl)}`)}>
                    查看全部 {chapters.length} 章 →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
