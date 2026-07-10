import { useCallback, useEffect, useMemo, useState } from 'react'
import { LogIn, Settings } from 'lucide-react'
import { Link as RouterLink } from 'react-router-dom'
import { getNav } from '../api/public'
import BeianFooter from '../components/BeianFooter'
import CategoryIcon from '../components/CategoryIcon'
import ThemeToggle from '../components/ThemeToggle'
import TopbarNav from '../components/TopbarNav'
import TopbarUserMenu from '../components/TopbarUserMenu'
import type { CategoryWithLinks, NavLink } from '../types'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import '../styles/topbar.css'
import '../styles/home.css'

const ASSET_BASE = '/bank-nav'
const HOME_AVATAR_URL = `${ASSET_BASE}/static/img/logo-20260710.webp`
const SPONSOR_IMAGE_URL = `${ASSET_BASE}/static/img/wxzsm-20260710.webp`
const WECHAT_IMAGE_URL = `${ASSET_BASE}/static/img/qq-20260710.webp`
const POLL_INTERVAL_MS = 30_000
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

function SectionMark() {
  return (
    <svg className="icon" viewBox="0 0 1024 1024" aria-hidden="true">
      <path d="M629.333333 202.666667v213.333333h277.333334v448h-512v-213.333333h-277.333334v-448h512z m213.333334 277.333333h-213.333334v170.666667h-170.666666v149.333333h384v-320z m-277.333334-213.333333h-384v320h213.333334v-170.666667h170.666666v-149.333333z m0 213.333333h-106.666666v106.666667h106.666666v-106.666667z" />
    </svg>
  )
}

function LocationIcon() {
  return (
    <svg className="icon" viewBox="0 0 1024 1024" aria-hidden="true">
      <path d="M512 249.976471c-99.388235 0-180.705882 81.317647-180.705882 180.705882s81.317647 180.705882 180.705882 180.705882 180.705882-81.317647 180.705882-180.705882-81.317647-180.705882-180.705882-180.705882z m0 301.17647c-66.258824 0-120.470588-54.211765-120.470588-120.470588s54.211765-120.470588 120.470588-120.470588 120.470588 54.211765 120.470588 120.470588-54.211765 120.470588-120.470588 120.470588z" />
      <path d="M512 39.152941c-216.847059 0-391.529412 174.682353-391.529412 391.529412 0 349.364706 391.529412 572.235294 391.529412 572.235294s391.529412-222.870588 391.529412-572.235294c0-216.847059-174.682353-391.529412-391.529412-391.529412z m0 891.482353C424.658824 873.411765 180.705882 686.682353 180.705882 430.682353c0-183.717647 147.576471-331.294118 331.294118-331.294118s331.294118 147.576471 331.294118 331.294118c0 256-243.952941 442.729412-331.294118 499.952941z" />
    </svg>
  )
}

function SponsorIcon() {
  return (
    <svg className="icon" viewBox="0 0 1024 1024" aria-hidden="true">
      <path d="M995.575172 725.451034c-12.358621-26.835862-38.488276-64.794483-92.689655-94.27862-62.146207-33.721379-136.297931-40.96-208.860689-20.303448l-99.928276 28.424827-279.304828-126.057931H22.775172v489.401379h509.704828l432.375172-195.266207c15.006897-6.708966 26.835862-19.42069 32.662069-34.957241 5.649655-15.36 4.943448-31.955862-1.942069-46.962759z" />
      <path d="M683.431724 427.431724v-70.62069h-38.311724l30.190345-30.190344-49.964138-49.964138-62.49931 62.49931h-6.002759L494.344828 276.656552l-49.787587 49.964138 30.013793 30.190344h-38.311724v70.62069h88.275862v35.310345h-88.275862v70.62069h88.275862v52.965517h70.62069v-52.965517h88.275862v-70.62069h-88.275862v-35.310345z" />
    </svg>
  )
}

function WechatIcon() {
  return (
    <svg className="icon" viewBox="0 0 1024 1024" aria-hidden="true">
      <path d="M691.537 318.713c11.305 0 22.491 0.83 33.587 2.065-30.178-140.519-180.417-244.922-351.905-244.922-191.721 0-348.77 130.677-348.77 296.612 0 95.781 52.25 174.437 139.561 235.444l-34.884 104.916l121.923-61.138c43.628 8.634 78.631 17.513 122.168 17.513 10.945 0 21.796-0.541 32.559-1.386-6.814-23.317-10.762-47.739-10.762-73.080 0-152.368 130.849-276.023 296.521-276.023zM1009.856 590.545c0-139.436-139.534-253.094-296.248-253.094-165.943 0-296.639 113.657-296.639 253.094 0 139.675 130.698 253.094 296.639 253.094 34.733 0 69.765-8.758 104.646-17.501l95.663 52.383-26.229-87.157c70.007-52.520 122.167-122.164 122.167-200.819z" />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg className="icon" viewBox="0 0 1024 1024" aria-hidden="true">
      <path d="M926.47619 355.644952V780.190476a73.142857 73.142857 0 0 1-73.142857 73.142857H170.666667a73.142857 73.142857 0 0 1-73.142857-73.142857V355.644952l304.103619 257.828572a170.666667 170.666667 0 0 0 220.745142 0L926.47619 355.644952zM853.333333 170.666667a74.044952 74.044952 0 0 1 26.087619 4.778666 72.704 72.704 0 0 1 30.622477 22.186667 73.508571 73.508571 0 0 1 10.678857 17.67619c3.169524 7.509333 5.12 15.652571 5.607619 24.210286L926.47619 243.809524v24.380952L559.469714 581.241905a73.142857 73.142857 0 0 1-91.306666 2.901333l-3.632762-2.925714L97.52381 268.190476v-24.380952a72.899048 72.899048 0 0 1 40.155428-65.292191A72.97219 72.97219 0 0 1 170.666667 170.666667h682.666666z" />
    </svg>
  )
}

function getInitial(name: string) {
  const trimmed = name.trim()
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : 'L'
}

function ProjectCard({ link }: { link: NavLink }) {
  return (
    <a
      className="projectItem b"
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      title={link.description ?? link.name}
    >
      <div className="projectItemLeft">
        <h3>{link.name}</h3>
        <p>{link.description || link.url}</p>
      </div>
      <div className="projectItemRight">
        <span className="runtime-icon">
          {link.icon ? (
            <CategoryIcon icon={link.icon} alt={link.name} size={22} />
          ) : (
            getInitial(link.name)
          )}
        </span>
      </div>
    </a>
  )
}

export default function HomePage() {
  const auth = useAuth()
  const { mode } = useTheme()
  const [data, setData] = useState<CategoryWithLinks[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [popupImage, setPopupImage] = useState<string | null>(null)
  const isAdmin = auth.user?.role === 'ADMIN'

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setError(null)
    try {
      const nextData = await getNav()
      setData(nextData)
      setError(null)
    } catch (nextError) {
      setError((nextError as Error).message)
    }
  }, [])

  useEffect(() => {
    void refresh()

    const timer = window.setInterval(() => {
      void refresh(true)
    }, POLL_INTERVAL_MS)
    const onFocus = () => {
      void refresh(true)
    }

    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  useEffect(() => {
    if (!popupImage) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPopupImage(null)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [popupImage])

  const categories = useMemo(
    () =>
      sortByOrder(data ?? []).reduce<CategoryWithLinks[]>((visibleCategories, category) => {
        const sortedLinks = sortByOrder(category.links ?? [])
        const links = isAdmin ? sortedLinks : sortedLinks.filter((link) => !isResumeLink(link))

        if (!isAdmin && sortedLinks.length > 0 && links.length === 0) {
          return visibleCategories
        }

        visibleCategories.push({
          ...category,
          links,
        })
        return visibleCategories
      }, []),
    [data, isAdmin],
  )

  const totals = useMemo(
    () => ({
      categoryCount: categories.length,
      linkCount: categories.reduce((sum, category) => sum + category.links.length, 0),
    }),
    [categories],
  )

  const timeline = categories.slice(0, 5)
  const snakeTheme = mode === 'dark' ? 'Dark' : 'Light'

  return (
    <div className="bank-nav-page">
      <div className="zyyo-filter" />
      <header className="topbar">
        <RouterLink to="/" className="topbar-brand" aria-label="返回首页">
          <span className="brand-dot" />
          <span>oldwang</span>
        </RouterLink>

        <TopbarNav />

        <div className="topbar-actions" aria-label="站点操作">
          {auth.token ? (
            <RouterLink to="/admin" className="topbar-action">
              <Settings size={16} />
              <span>管理</span>
            </RouterLink>
          ) : (
            <RouterLink to="/login" className="topbar-action" state={{ from: '/' }}>
              <LogIn size={16} />
              <span>登录</span>
            </RouterLink>
          )}
          <ThemeToggle />
          {auth.token && <TopbarUserMenu />}
        </div>
      </header>
      <div className="zyyo-main">
        <aside className="zyyo-left">
          <div
            className="logo"
            style={{ backgroundImage: `url(${HOME_AVATAR_URL})` }}
          />
          <div className="left-div left-des">
            <div className="left-des-item">
              <LocationIcon />
              China · Chengdu
            </div>
          </div>
          <div className="left-div left-tag">
            <div className="left-tag-item">实时分类 {totals.categoryCount}</div>
            <div className="left-tag-item">动态链接 {totals.linkCount}</div>
          </div>
          <div className="left-div left-time">
            <ul id="line">
              {timeline.length ? (
                timeline.map((category, index) => (
                  <li key={category.id}>
                    <div className={`focus${index === 0 ? ' active-focus' : ''}`} />
                    <div>{category.name}</div>
                    <div>{category.links.length} links</div>
                  </li>
                ))
              ) : (
                <li>
                  <div className="focus active-focus" />
                  <div>{error ? '加载失败' : '正在加载'}</div>
                  <div>live</div>
                </li>
              )}
            </ul>
          </div>
        </aside>

        <section className="zyyo-right">
          <header>
            <div
              className="index-logo"
              style={{ backgroundImage: `url(${HOME_AVATAR_URL})` }}
            />
            <div className="welcome">
              Hello I&apos; m <span className="gradientText">oldwang</span>
            </div>
            <div className="description">
              A real-time <span className="purpleText">navigation</span>
            </div>

            <div className="iconContainer">
              <button
                className="iconItem"
                type="button"
                onClick={() => setPopupImage(SPONSOR_IMAGE_URL)}
              >
                <SponsorIcon />
                <div className="iconTip">赞助</div>
              </button>
              <button
                className="iconItem"
                type="button"
                onClick={() => setPopupImage(WECHAT_IMAGE_URL)}
              >
                <WechatIcon />
                <div className="iconTip">公众号</div>
              </button>
              <a className="iconItem" href="mailto:hello@example.com">
                <MailIcon />
                <div className="iconTip">邮箱</div>
              </a>
              <RouterLink
                className="iconItem"
                to={auth.token ? '/admin' : '/login'}
                title={auth.token ? '管理' : '登录'}
              >
                <SectionMark />
                <div className="iconTip">{auth.token ? '管理' : '登录'}</div>
              </RouterLink>
            </div>

            <div className="tanChiShe">
              <img
                id="tanChiShe"
                src={`${ASSET_BASE}/static/svg/snake-${snakeTheme}.svg`}
                alt=""
              />
            </div>
          </header>

          <main className="bank-content">
            {error && <div className="runtime-message">加载失败：{error}</div>}

            {!data && !error && (
              <section className="runtime-section">
                <div className="title">
                  <SectionMark />
                  正在加载
                </div>
                <div className="projectList">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div className="projectItem b projectItemSkeleton" key={index} />
                  ))}
                </div>
              </section>
            )}

            {data && !categories.length && (
              <div className="runtime-message">暂无分类数据</div>
            )}

            {categories.map((category) => (
              <section className="runtime-section" key={category.id}>
                <div className="title">
                  <SectionMark />
                  {category.name}
                </div>
                {category.links.length ? (
                  <div className="projectList">
                    {category.links.map((link) => (
                      <ProjectCard key={link.id} link={link} />
                    ))}
                  </div>
                ) : (
                  <div className="runtime-message">暂无链接</div>
                )}
              </section>
            ))}
          </main>
        </section>
      </div>

      <BeianFooter />

      <div
        className={`tc${popupImage ? ' active' : ''}`}
        onClick={() => setPopupImage(null)}
        aria-hidden={!popupImage}
      >
        <div className={`tc-main${popupImage ? ' active' : ''}`} onClick={(e) => e.stopPropagation()}>
          {popupImage && <img className="tc-img" src={popupImage} alt="" />}
        </div>
      </div>
    </div>
  )
}
