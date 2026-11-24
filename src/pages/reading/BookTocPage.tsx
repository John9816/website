import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Search } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getBookChapters, type BookChapter } from '../../api/reading'
import AppShell from '../../components/AppShell'
import '../../styles/reading.css'

export default function BookTocPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const sourceId = params.get('sourceId') || undefined
  const bookUrl = params.get('bookUrl') || ''

  const [chapters, setChapters] = useState<BookChapter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [reverse, setReverse] = useState(false)

  useEffect(() => {
    if (!bookUrl) {
      setError('缺少书籍参数')
      setLoading(false)
      return
    }
    let alive = true
    getBookChapters(sourceId, bookUrl)
      .then((data) => {
        if (alive) setChapters(data.list || [])
      })
      .catch((e) => {
        if (alive) setError(e?.message || '加载目录失败')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [sourceId, bookUrl])

  const shown = useMemo(() => {
    const list = filter
      ? chapters.filter((c) => c.title.toLowerCase().includes(filter.toLowerCase()))
      : chapters
    return reverse ? [...list].reverse() : list
  }, [chapters, filter, reverse])

  const openChapter = (chapterUrl: string) => {
    const q = new URLSearchParams()
    if (sourceId) q.set('sourceId', sourceId)
    q.set('bookUrl', bookUrl)
    q.set('chapterUrl', chapterUrl)
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
            <span className="reading-page-title">目录（{chapters.length}）</span>
            <button type="button" className="reading-refresh" onClick={() => setReverse((v) => !v)} title="倒序">
              {reverse ? '正序' : '倒序'}
            </button>
          </div>
          <div className="reading-search compact">
            <Search size={16} />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="筛选章节"
              aria-label="筛选章节"
            />
          </div>
        </header>

        <div className="reading-body">
          {loading && <div className="reading-loading">加载中…</div>}
          {error && <div className="reading-error">{error}</div>}
          <div className="reading-toc-page-list">
            {shown.map((c, i) => (
              <button type="button" key={`${c.url}-${i}`} onClick={() => openChapter(c.url)}>
                <span className="reading-toc-index">{reverse ? chapters.length - chapters.indexOf(c) : chapters.indexOf(c) + 1}</span>
                <span>{c.title}</span>
              </button>
            ))}
            {!loading && shown.length === 0 && <div className="reading-empty">没有匹配的章节</div>}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
