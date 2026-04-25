import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { ArrowUp, LogIn, Music2, Search, Settings, X } from 'lucide-react'
import { getNav } from '../api/public'
import type { CategoryWithLinks, NavLink } from '../types'
import CategoryIcon from '../components/CategoryIcon'
import LinkCard from '../components/LinkCard'
import ThemeToggle from '../components/ThemeToggle'
import '../styles/home.css'

export default function HomePage() {
  const [data, setData] = useState<CategoryWithLinks[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [showTop, setShowTop] = useState(false)
  const sectionRefs = useRef<Record<number, HTMLElement | null>>({})

  useEffect(() => {
    getNav()
      .then(setData)
      .catch((nextError) => setError((nextError as Error).message))
  }, [])

  const categories = useMemo(
    () => [...(data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [data],
  )

  const normalizedQuery = query.trim().toLowerCase()
  const filterLinks = useCallback(
    (links: NavLink[]) => {
      if (!normalizedQuery) {
        return [...links].sort((a, b) => a.sortOrder - b.sortOrder)
      }

      return [...links]
        .filter(
          (link) =>
            link.name.toLowerCase().includes(normalizedQuery) ||
            (link.description ?? '').toLowerCase().includes(normalizedQuery) ||
            link.url.toLowerCase().includes(normalizedQuery),
        )
        .sort((a, b) => a.sortOrder - b.sortOrder)
    },
    [normalizedQuery],
  )

  const visibleCategories = useMemo(() => {
    if (!normalizedQuery) return categories

    return categories
      .map((category) => ({
        ...category,
        links: filterLinks(category.links ?? []),
      }))
      .filter((category) => category.links.length > 0)
  }, [categories, filterLinks, normalizedQuery])

  const totalLinks = useMemo(
    () => categories.reduce((count, category) => count + (category.links?.length ?? 0), 0),
    [categories],
  )

  useEffect(() => {
    if (!visibleCategories.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)

        if (visibleEntries.length) {
          const id = Number(visibleEntries[0].target.getAttribute('data-cat-id'))
          if (id) setActiveId(id)
        }
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: [0, 0.2, 0.6, 1] },
    )

    Object.values(sectionRefs.current).forEach((element) => {
      if (element) observer.observe(element)
    })

    return () => observer.disconnect()
  }, [visibleCategories])

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 320)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollTo = (id: number) => {
    const element = sectionRefs.current[id]
    if (!element) return

    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveId(id)
  }

  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

  return (
    <div className="home">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-dot" />
          <span className="brand-text">我的导航</span>
        </div>
        <div className="sidebar-footer" aria-label="站点快捷入口">
          <ThemeToggle />
          <RouterLink to="/login" className="admin-link">
            <LogIn size={16} />
            <span>登录</span>
          </RouterLink>
          <RouterLink to="/music" className="admin-link">
            <Music2 size={16} />
            <span>音乐</span>
          </RouterLink>
          <RouterLink to="/admin" className="admin-link">
            <Settings size={16} />
            <span>管理</span>
          </RouterLink>
        </div>
        <nav className="side-nav" aria-label="分类导航">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={`side-item ${activeId === category.id ? 'active' : ''}`}
              onClick={() => scrollTo(category.id)}
              title={category.name}
            >
              <CategoryIcon icon={category.icon} size={18} />
              <span className="side-item-name">{category.name}</span>
            </button>
          ))}
          {!categories.length && !error && <div className="side-empty">加载中...</div>}
        </nav>
      </aside>

      <main className="content">
        <header className="hero">
          <div>
            <h1>
              <span className="hero-title">Hello</span>{' '}
              <span className="hero-emoji">👋</span>
            </h1>
            <p>
              收藏的资源与工具，一键直达
              {totalLinks > 0 && (
                <span className="hero-stat">
                  · {categories.length} 个分类 / {totalLinks} 个链接
                </span>
              )}
            </p>
          </div>
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索链接、描述或网址"
              aria-label="搜索链接"
            />
            {query && (
              <button
                type="button"
                className="search-clear"
                onClick={() => setQuery('')}
                aria-label="清除搜索"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </header>

        {error && <div className="error-box">加载失败：{error}</div>}

        {!data && !error && (
          <div className="skeleton-wrap">
            {[0, 1].map((index) => (
              <section key={index} className="cat-section">
                <div className="sk sk-title" />
                <div className="link-grid">
                  {Array.from({ length: 6 }).map((_, cardIndex) => (
                    <div key={cardIndex} className="sk sk-card" />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {data && !visibleCategories.length && (
          <div className="empty empty-block">
            {normalizedQuery ? `未找到与“${query}”匹配的链接` : '暂无内容'}
          </div>
        )}

        {visibleCategories.map((category) => (
          <section
            key={category.id}
            className="cat-section"
            data-cat-id={category.id}
            ref={(element) => {
              sectionRefs.current[category.id] = element
            }}
          >
            <h2 className="cat-title">
              <CategoryIcon icon={category.icon} size={22} />
              <span>{category.name}</span>
            </h2>
            {category.links?.length ? (
              <div className="link-grid">
                {category.links.map((link) => (
                  <LinkCard key={link.id} link={link} />
                ))}
              </div>
            ) : (
              <div className="empty">暂无链接</div>
            )}
          </section>
        ))}
      </main>

      <button
        type="button"
        className={`to-top ${showTop ? 'show' : ''}`}
        onClick={scrollTop}
        aria-label="返回顶部"
        title="返回顶部"
      >
        <ArrowUp size={18} />
      </button>
    </div>
  )
}
