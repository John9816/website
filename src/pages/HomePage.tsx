import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Tooltip } from 'antd'
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  CircleX,
  Compass,
  Heart,
  Image,
  LayoutGrid,
  List,
  MessageCircle,
  MessageSquare,
  Music2,
  RefreshCw,
  Search,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { getNav } from '../api/public'
import { siteImages } from '../utils/siteImages'
import BeianFooter from '../components/BeianFooter'
import CategoryIcon from '../components/CategoryIcon'
import SiteHeader from '../components/SiteHeader'
import HomeOrbit from '../components/HomeOrbit'
import type { CategoryWithLinks, NavLink } from '../types'
import '../styles/home.css'

const REFRESH_INTERVAL = 5 * 60 * 1000
const TOOLS = [
  { to: '/music', name: '在线音乐', detail: '音乐', Icon: Music2, tone: 'music' },
  { to: '/ai-chat', name: 'AI 对话', detail: '对话', Icon: MessageSquare, tone: 'chat' },
  { to: '/ai-image', name: 'AI 生图', detail: '创作', Icon: Image, tone: 'image' },
  { to: '/admin/kb', name: '知识库', detail: '笔记', Icon: BookOpen, tone: 'knowledge' },
]

const QR_IMAGES = {
  contact: { title: '联系我', src: siteImages.contact.url, alt: '联系二维码' },
  sponsor: { title: '赞助', src: siteImages.sponsor.url, alt: '赞助二维码' },
}

function sortByOrder<T extends { sortOrder: number }>(items: T[]) {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder)
}

function isResumeLink(link: NavLink) {
  try {
    return new URL(link.url, window.location.origin).pathname.toLowerCase() === '/resume'
  } catch {
    return link.url.trim().toLowerCase() === '/resume'
  }
}

function displayAddress(url: string) {
  try {
    const parsed = new URL(url, window.location.origin)
    return parsed.origin === window.location.origin && parsed.pathname !== '/'
      ? parsed.pathname
      : parsed.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function ResourceCard({ link }: { link: NavLink }) {
  return (
    <a
      className="home-resource"
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${link.name}（在新窗口打开）`}
    >
      <span className="home-resource__icon" aria-hidden="true">
        {link.icon ? (
          <CategoryIcon icon={link.icon} size={23} />
        ) : (
          <span>{link.name.trim().slice(0, 1).toUpperCase() || 'L'}</span>
        )}
      </span>
      <span className="home-resource__body">
        <span className="home-resource__name" title={link.name}>{link.name}</span>
        <span className="home-resource__description" title={link.description || undefined}>
          {link.description || displayAddress(link.url)}
        </span>
        <span className="home-resource__address">{displayAddress(link.url)}</span>
      </span>
      <ArrowUpRight className="home-resource__arrow" size={15} aria-hidden="true" />
    </a>
  )
}

export default function HomePage() {
  const [data, setData] = useState<CategoryWithLinks[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [qrImage, setQrImage] = useState<keyof typeof QR_IMAGES | null>(null)
  const requestId = useRef(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase())

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current
    setRefreshing(true)
    setError(null)
    try {
      const nextData = await getNav()
      if (currentRequest === requestId.current) setData(nextData)
    } catch (nextError) {
      if (currentRequest === requestId.current) {
        setError(nextError instanceof Error ? nextError.message : '暂时无法获取导航数据')
      }
    } finally {
      if (currentRequest === requestId.current) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const timer = window.setInterval(refreshWhenVisible, REFRESH_INTERVAL)
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      requestId.current += 1
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [refresh])

  const categories = useMemo(
    () => sortByOrder(data ?? []).reduce<CategoryWithLinks[]>((visible, category) => {
      const sortedLinks = sortByOrder(category.links ?? [])
      const links = sortedLinks.filter((link) => !isResumeLink(link))
      if (sortedLinks.length === 0 || links.length > 0) visible.push({ ...category, links })
      return visible
    }, []),
    [data],
  )

  useEffect(() => {
    if (data && selectedCategory !== null && !categories.some(({ id }) => id === selectedCategory)) {
      setSelectedCategory(null)
    }
  }, [categories, data, selectedCategory])

  const visibleCategories = useMemo(() => categories
    .filter((category) => selectedCategory === null || category.id === selectedCategory)
    .map((category) => ({
      ...category,
      links: category.links.filter((link) => !deferredQuery ||
        [link.name, link.description, link.url, category.name]
          .some((value) => value?.toLocaleLowerCase().includes(deferredQuery))),
    }))
    .filter((category) => !deferredQuery || category.links.length > 0),
  [categories, deferredQuery, selectedCategory])

  const totalCount = categories.reduce((total, category) => total + category.links.length, 0)
  const resultCount = visibleCategories.reduce((total, category) => total + category.links.length, 0)
  const activeCategory = categories.find(({ id }) => id === selectedCategory)
  const currentQr = qrImage ? QR_IMAGES[qrImage] : null

  const clearSearch = () => {
    setQuery('')
    searchRef.current?.focus()
  }

  return (
    <div className="home-page">
      <SiteHeader />
      <div className="home-workspace">
        <aside className="home-sidebar" aria-label="导航分类">
          <div className="home-sidebar__label">浏览分类</div>
          <nav className="home-categories" aria-label="资源分类筛选">
            <button
              type="button"
              className={`home-category${selectedCategory === null ? ' is-active' : ''}`}
              aria-pressed={selectedCategory === null}
              onClick={() => setSelectedCategory(null)}
            >
              <Compass size={17} aria-hidden="true" />
              <span className="home-category__name">全部站点</span>
              <span className="home-category__count">{data ? totalCount : '—'}</span>
            </button>
            {categories.map((category) => (
              <button
                type="button"
                key={category.id}
                className={`home-category${selectedCategory === category.id ? ' is-active' : ''}`}
                aria-pressed={selectedCategory === category.id}
                onClick={() => setSelectedCategory(category.id)}
              >
                <span className="home-category__icon" aria-hidden="true">
                  <CategoryIcon icon={category.icon || 'folder'} size={17} />
                </span>
                <span className="home-category__name" title={category.name}>{category.name}</span>
                <span className="home-category__count">{category.links.length}</span>
              </button>
            ))}
          </nav>
          <div className="home-sidebar__bottom">
            <ArrowDownLeft size={15} aria-hidden="true" />
            <span>oldwang 的收藏</span>
          </div>
        </aside>

        <main className="home-main" id="main-content">
          <header className="home-heading">
            <div className="home-heading__copy">
              <p className="home-heading__eyebrow">个人工作台</p>
              <h1>我的导航<span aria-hidden="true">.</span></h1>
              <p className="home-heading__description">收藏好用的，连接有趣的。</p>
              <div className="home-identity">
                <img src={siteImages.logo.url} width={28} height={28} alt="oldwang" />
                <span>oldwang</span>
              </div>
            </div>
            <HomeOrbit />
          </header>

          <div className="home-search" role="search">
            <Search size={21} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Escape') clearSearch() }}
              placeholder="搜索站点、工具或分类"
              aria-label="搜索站点、工具或分类"
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <Tooltip title="清空搜索">
                <button type="button" className="home-icon-button" aria-label="清空搜索" onClick={clearSearch}>
                  <CircleX size={18} aria-hidden="true" />
                </button>
              </Tooltip>
            )}
          </div>

          <section className="home-tools" aria-labelledby="home-tools-title">
            <h2 id="home-tools-title">常用工具</h2>
            <div className="home-tools__grid">
              {TOOLS.map(({ to, name, detail, Icon, tone }) => (
                <Link key={to} to={to} className={`home-tool home-tool--${tone}`}>
                  <span className="home-tool__icon"><Icon size={21} aria-hidden="true" /></span>
                  <span className="home-tool__copy"><strong>{name}</strong><span>{detail}</span></span>
                  <ArrowUpRight size={14} className="home-tool__arrow" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>

          <section className="home-directory" aria-labelledby="home-directory-title">
            <div className="home-directory__bar">
              <div className="home-directory__heading">
                <h2 id="home-directory-title">{deferredQuery ? '搜索结果' : activeCategory?.name || '站点收藏'}</h2>
                <span className="home-directory__count" role="status" aria-live="polite">
                  {data ? `${resultCount} 个站点` : refreshing ? '加载中' : ''}
                </span>
              </div>
              <div className="home-directory__actions">
                <Tooltip title="刷新站点">
                  <button
                    type="button"
                    className="home-icon-button"
                    aria-label="刷新站点"
                    disabled={refreshing}
                    onClick={() => void refresh()}
                  >
                    <RefreshCw size={16} className={refreshing ? 'home-refreshing' : ''} aria-hidden="true" />
                  </button>
                </Tooltip>
                <div className="home-view-switch" role="group" aria-label="显示方式">
                  <Tooltip title="网格视图">
                    <button type="button" aria-label="网格视图" aria-pressed={view === 'grid'} className={`home-icon-button${view === 'grid' ? ' is-active' : ''}`} onClick={() => setView('grid')}>
                      <LayoutGrid size={16} aria-hidden="true" />
                    </button>
                  </Tooltip>
                  <Tooltip title="列表视图">
                    <button type="button" aria-label="列表视图" aria-pressed={view === 'list'} className={`home-icon-button${view === 'list' ? ' is-active' : ''}`} onClick={() => setView('list')}>
                      <List size={17} aria-hidden="true" />
                    </button>
                  </Tooltip>
                </div>
              </div>
            </div>

            {error && (
              <div className="home-error" role="alert">
                <AlertCircle size={19} aria-hidden="true" />
                <span><strong>{data ? '站点更新失败' : '站点加载失败'}</strong><span>{error}</span></span>
                <button type="button" onClick={() => void refresh()} disabled={refreshing}>重试</button>
              </div>
            )}

            {!data && !error && (
              <div className="home-resource-grid home-loading" aria-label="正在加载站点" aria-busy="true">
                {Array.from({ length: 9 }, (_, index) => (
                  <div className="home-resource home-resource--skeleton" key={index} aria-hidden="true">
                    <span className="home-skeleton-icon" />
                    <span className="home-skeleton-copy"><span /><span /><span /></span>
                  </div>
                ))}
              </div>
            )}

            {data && visibleCategories.length === 0 && (
              <div className="home-empty">
                {deferredQuery ? <Search size={28} aria-hidden="true" /> : <Compass size={28} aria-hidden="true" />}
                <h3>{deferredQuery ? '没有找到相关站点' : '暂无站点收藏'}</h3>
                {deferredQuery && <button type="button" onClick={clearSearch}>清空搜索</button>}
              </div>
            )}

            <div className={`home-groups home-groups--${view}`}>
              {visibleCategories.map((category) => (
                <section className="home-group" key={category.id} aria-labelledby={`home-category-${category.id}`}>
                  <div className="home-group__heading">
                    <span className="home-group__icon" aria-hidden="true"><CategoryIcon icon={category.icon || 'folder'} size={17} /></span>
                    <h3 id={`home-category-${category.id}`}>{category.name}</h3>
                    <span>{category.links.length}</span>
                    <div className="home-group__rule" />
                  </div>
                  {category.links.length ? (
                    <div className="home-resource-grid">
                      {category.links.map((link) => <ResourceCard key={link.id} link={link} />)}
                    </div>
                  ) : <p className="home-group__empty">暂无站点</p>}
                </section>
              ))}
            </div>
          </section>

          <div className="home-contact-links" aria-label="联系与支持">
            <button type="button" onClick={() => setQrImage('contact')}><MessageCircle size={15} aria-hidden="true" />联系我</button>
            <button type="button" onClick={() => setQrImage('sponsor')}><Heart size={15} aria-hidden="true" />赞助</button>
          </div>
          <BeianFooter />
        </main>
      </div>

      <Modal
        title={currentQr?.title}
        open={!!currentQr}
        onCancel={() => setQrImage(null)}
        footer={null}
        centered
        width={350}
        className="home-qr-modal"
        destroyOnClose
      >
        {currentQr && <img className="home-qr-image" src={currentQr.src} alt={currentQr.alt} />}
      </Modal>
    </div>
  )
}
