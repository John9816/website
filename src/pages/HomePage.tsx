import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link as RouterLink, NavLink as RouterNavLink } from 'react-router-dom'
import { ArrowUp, LogIn, Search, Settings, X } from 'lucide-react'
import { getNav } from '../api/public'
import type { CategoryWithLinks, NavLink } from '../types'
import { useAuth } from '../context/AuthContext'
import CategoryIcon from '../components/CategoryIcon'
import LinkCard from '../components/LinkCard'
import ThemeToggle from '../components/ThemeToggle'
import '../styles/topbar.css'
import '../styles/home.css'

export default function HomePage() {
  const auth = useAuth()
  const [data, setData] = useState<CategoryWithLinks[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [showTop, setShowTop] = useState(false)
  const [isTopbarPinned, setIsTopbarPinned] = useState(false)
  const sectionRefs = useRef<Record<number, HTMLElement | null>>({})
  const contentRef = useRef<HTMLElement | null>(null)

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

  useEffect(() => {
    const root = contentRef.current
    if (!root || !visibleCategories.length) return

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
      {
        root,
        rootMargin: '-18% 0px -68% 0px',
        threshold: [0, 0.2, 0.6, 1],
      },
    )

    Object.values(sectionRefs.current).forEach((element) => {
      if (element) observer.observe(element)
    })

    return () => observer.disconnect()
  }, [visibleCategories])

  useEffect(() => {
    if (!visibleCategories.length) return
    if (visibleCategories.some((category) => category.id === activeId)) return
    setActiveId(visibleCategories[0].id)
  }, [activeId, visibleCategories])

  useEffect(() => {
    const root = contentRef.current
    if (!root) return

    const onScroll = () => {
      const nextY = root.scrollTop
      setShowTop(nextY > 320)
      setIsTopbarPinned(nextY > 24)
    }

    onScroll()
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => root.removeEventListener('scroll', onScroll)
  }, [])

  const scrollTo = (id: number) => {
    const element = sectionRefs.current[id]
    if (!element) return

    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveId(id)
  }

  const scrollTop = () =>
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })

  return (
    <div className="home">
      <header className={`topbar${isTopbarPinned ? ' topbar--pinned' : ''}`}>
        <RouterLink to="/" className="topbar-brand" aria-label="返回首页">
          <span className="brand-dot" />
          <span className="brand-text">我的导航</span>
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
        </nav>

        <div className="topbar-actions" aria-label="站点操作">
          {auth.token ? (
            <RouterLink to="/admin" className="topbar-action">
              <Settings size={16} />
              <span>管理</span>
            </RouterLink>
          ) : (
            <RouterLink to="/login" className="topbar-action">
              <LogIn size={16} />
              <span>登录</span>
            </RouterLink>
          )}
          <ThemeToggle />
        </div>
      </header>

      <aside className="sidebar">
        <div className="sidebar-head">
          <span className="sidebar-kicker">
            {normalizedQuery ? '搜索结果' : '分类导航'}
          </span>
          <span className="sidebar-meta">{visibleCategories.length} 个分类</span>
        </div>
        <nav className="side-nav" aria-label="分类导航">
          {visibleCategories.map((category) => (
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
          {!visibleCategories.length && !error && !normalizedQuery && (
            <div className="side-empty">加载中...</div>
          )}
        </nav>
      </aside>

      <main ref={contentRef} className="content">
        <header className="hero">
          <div>
            <h1>
              <span className="hero-title">Hello</span>{' '}
              <span className="hero-emoji">👋</span>
            </h1>
            <p>收藏的资源与工具，一键直达。</p>
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
