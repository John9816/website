import { useEffect, useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Apple,
  ArrowLeft,
  Check,
  ChevronRight,
  Cloud,
  Disc3,
  Download,
  Headphones,
  Heart,
  Laptop,
  ListMusic,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Radio,
  Search,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { siteImages } from '../utils/siteImages'
import {
  getLatestMusicInstaller,
  type MusicInstallerReleaseView,
} from '../api/public'

type PlatformId = 'android' | 'ios' | 'windows' | 'macos'

type PlatformOption = {
  id: PlatformId
  label: string
  shortLabel: string
  icon: LucideIcon
  eyebrow: string
  title: string
  description: string
  requirement: string
  format: string
}

// Mirror verified, published assets before changing this version.
const DESKTOP_VERSION = '1.1.46'
const DOWNLOAD_BASE = 'https://hi.751152.xyz/downloads/music'

const FALLBACK_INSTALLER: MusicInstallerReleaseView = {
  version: '1.1.46',
  buildNumber: 57,
  title: '柒伍壹壹音乐',
  channel: 'DuckMusic Flutter',
  fileName: 'DuckMusic-Flutter-v1.1.46-Android-arm64-v8a.apk',
  downloadUrl:
    'https://api.751152.xyz/updates/DuckMusic-Flutter-v1.1.46-Android-arm64-v8a.apk',
  releasedAt: '2026-09-11',
  notes: '一套 Flutter 代码覆盖 Android、iOS、Windows 与 macOS。',
  platform: 'Android',
  minAndroid: '8.0',
  packageName: 'com.music.player',
}

const platforms: PlatformOption[] = [
  {
    id: 'android',
    label: 'Android',
    shortLabel: 'Android',
    icon: Smartphone,
    eyebrow: '随身听',
    title: 'Android 版',
    description: '从本站服务器直接下载 APK。支持后台播放、通知栏控制与本地下载。',
    requirement: 'Android 8.0 或更高版本',
    format: 'APK · arm64-v8a',
  },
  {
    id: 'ios',
    label: 'iPhone / iPad',
    shortLabel: 'iOS',
    icon: Apple,
    eyebrow: '移动端',
    title: 'iOS 版',
    description: '与其他客户端共享音乐库和账号，提供需自行签名安装的 IPA 测试包。',
    requirement: 'iOS 15 或更高版本',
    format: 'IPA · 需自行签名',
  },
  {
    id: 'windows',
    label: 'Windows',
    shortLabel: 'Windows',
    icon: Laptop,
    eyebrow: '桌面端',
    title: 'Windows 版',
    description: '为键鼠和大屏优化的音乐工作台，EXE 安装包从本站服务器直接下载。',
    requirement: 'Windows 10 / 11 · 64 位',
    format: 'EXE installer',
  },
  {
    id: 'macos',
    label: 'macOS',
    shortLabel: 'macOS',
    icon: Apple,
    eyebrow: '桌面端',
    title: 'macOS 版',
    description: '原生窗口体验，提供 Apple Silicon 与 Intel 两种构建的直接下载。',
    requirement: 'macOS 12 或更高版本',
    format: 'DMG · Apple Silicon / Intel',
  },
]

const featureGroups: Array<{
  icon: LucideIcon
  title: string
  description: string
}> = [
  {
    icon: Search,
    title: '多音源聚合',
    description: '红源、绿源、橙源统一搜索，歌曲、歌手和歌单一次找到。',
  },
  {
    icon: Cloud,
    title: '跨端同步',
    description: '同一账号同步收藏、历史与歌单，换设备无需重新整理。',
  },
  {
    icon: Headphones,
    title: '完整播放体验',
    description: '歌词、队列、音质选择、后台播放和离线下载都在手边。',
  },
  {
    icon: Radio,
    title: '不只音乐',
    description: '网络电台、电视直播、视频解析与 AI 工具集中收纳。',
  },
]

const songs = [
  { title: '晴天', artist: '周杰伦', time: '4:29', color: '#ec6f55' },
  { title: '唯一', artist: '告五人', time: '4:32', color: '#4e82b4' },
  { title: '像我这样的人', artist: '毛不易', time: '3:27', color: '#8472a7' },
  { title: '若月亮没来', artist: '王宇宙Leto', time: '3:40', color: '#d0a53f' },
]

const installNotes: Record<PlatformId, string[]> = {
  android: ['点击按钮直接下载 APK', '按系统提示允许本次安装', '登录后自动同步音乐库'],
  ios: ['直接下载 IPA 测试包', '在电脑上使用签名工具完成签名与安装', '使用同一账号登录'],
  windows: ['点击按钮直接下载 EXE', '打开下载的安装程序', '按安装向导完成安装并登录'],
  macos: ['选择 Apple Silicon 或 Intel 芯片', '直接下载对应的 DMG 测试包', '请先阅读下方签名状态说明'],
}

function detectPlatform(): PlatformId {
  if (typeof navigator === 'undefined') return 'android'
  const value = `${navigator.platform} ${navigator.userAgent}`.toLowerCase()
  if (/iphone|ipad|ipod/.test(value)) return 'ios'
  if (/mac/.test(value)) return 'macos'
  if (/win/.test(value)) return 'windows'
  return 'android'
}

function formatSize(bytes?: number) {
  if (typeof bytes !== 'number' || bytes <= 0) return null
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

export default function MusicPromoPage() {
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformId>('android')
  const [macArchitecture, setMacArchitecture] = useState<'arm64' | 'x64'>('arm64')
  const [installer, setInstaller] = useState<MusicInstallerReleaseView | null>(null)
  const [installerError, setInstallerError] = useState(false)

  useEffect(() => {
    setSelectedPlatform(detectPlatform())
  }, [])

  useEffect(() => {
    let mounted = true
    getLatestMusicInstaller()
      .then((data) => {
        if (!mounted) return
        setInstaller(data)
        setInstallerError(false)
      })
      .catch(() => {
        if (!mounted) return
        setInstaller(FALLBACK_INSTALLER)
        setInstallerError(true)
      })

    return () => {
      mounted = false
    }
  }, [])

  const activeInstaller = installer ?? FALLBACK_INSTALLER
  const platform = platforms.find((item) => item.id === selectedPlatform) ?? platforms[0]
  const PlatformIcon = platform.icon
  const androidVersion = `v${activeInstaller.version}${
    activeInstaller.buildNumber ? ` (${activeInstaller.buildNumber})` : ''
  }`
  const sizeLabel = formatSize(activeInstaller.sizeBytes)

  const download = useMemo(() => {
    if (selectedPlatform === 'android') {
      return {
        href: activeInstaller.downloadUrl,
        label: '直接下载 Android 版',
      }
    }
    if (selectedPlatform === 'ios') {
      return {
        href: `${DOWNLOAD_BASE}/DuckMusic-Flutter-v${DESKTOP_VERSION}-iOS-unsigned.ipa`,
        label: '下载 iOS IPA（需签名）',
      }
    }
    return {
      href: `${DOWNLOAD_BASE}/DuckMusic-Flutter-v${DESKTOP_VERSION}-${
        selectedPlatform === 'windows' ? 'Windows-x64-setup.exe' : `macOS-${macArchitecture}.dmg`
      }`,
      label: selectedPlatform === 'windows'
        ? '直接下载 Windows 版'
        : `下载 macOS ${macArchitecture === 'arm64' ? 'Apple Silicon' : 'Intel'} 版`,
    }
  }, [selectedPlatform, macArchitecture, activeInstaller.downloadUrl])

  return (
    <main className="music-promo">
      <header className="music-promo__nav" aria-label="应用页面导航">
        <Link className="music-promo__brand" to="/music" aria-label="返回柒伍壹壹音乐网页版">
          <img src={siteImages.musicIcon.url} alt="" />
          <span>
            <strong>柒伍壹壹音乐</strong>
            <small>DuckMusic</small>
          </span>
        </Link>
        <Link className="music-promo__web-player" to="/music">
          <ArrowLeft size={16} aria-hidden="true" />
          网页版
        </Link>
      </header>

      <section className="music-promo__hero" aria-labelledby="music-promo-title">
        <div className="music-promo__hero-copy">
          <p className="music-promo__eyebrow">
            <span /> 四端同步 · 随处继续听
          </p>
          <h1 id="music-promo-title">
            一份音乐库，
            <span>每块屏幕都在播放。</span>
          </h1>
          <p className="music-promo__lead">
            DuckMusic 将搜索、歌单、歌词与播放进度带到 Android、iOS、Windows 和 macOS。
            同一个账号，放下手机后，在电脑上从刚才的位置继续。
          </p>

          <div className="music-promo__platform-picker" role="tablist" aria-label="选择系统">
            {platforms.map(({ id, shortLabel, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-label={shortLabel}
                aria-selected={selectedPlatform === id}
                className={selectedPlatform === id ? 'is-active' : undefined}
                onClick={() => setSelectedPlatform(id)}
              >
                <Icon size={17} aria-hidden="true" />
                <span>{shortLabel}</span>
              </button>
            ))}
          </div>

          {selectedPlatform === 'macos' ? (
            <div
              className="music-promo__platform-picker"
              role="group"
              aria-label="选择 Mac 芯片"
              style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}
            >
              {(['arm64', 'x64'] as const).map((architecture) => (
                <button
                  key={architecture}
                  type="button"
                  aria-pressed={macArchitecture === architecture}
                  className={macArchitecture === architecture ? 'is-active' : undefined}
                  onClick={() => setMacArchitecture(architecture)}
                >
                  {architecture === 'arm64' ? 'Apple Silicon' : 'Intel'}
                </button>
              ))}
            </div>
          ) : null}

          <div className="music-promo__primary-actions">
            <a
              className="music-promo__download"
              href={download.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Download size={18} />
              <span>{download.label}</span>
            </a>
            <span className="music-promo__version">
              {selectedPlatform === 'android' ? androidVersion : `v${DESKTOP_VERSION} · ${platform.format}`}
              {selectedPlatform === 'android' && sizeLabel ? ` · ${sizeLabel}` : ''}
            </span>
          </div>

          <p className="music-promo__trust">
            <ShieldCheck size={15} aria-hidden="true" />
            本站直连下载 · 无需访问 GitHub
          </p>
          {selectedPlatform === 'macos' ? (
            <p className="music-promo__availability">
              当前 macOS v{DESKTOP_VERSION} 测试包存在签名问题，可能被系统阻止打开。
              建议先使用网页版，等待签名修复版本。
            </p>
          ) : null}
        </div>

        <div className="music-promo__stage" data-platform={selectedPlatform}>
          <div className="music-promo__stage-label" aria-hidden="true">
            <span>{platform.eyebrow}</span>
            <strong>{platform.label}</strong>
          </div>
          {selectedPlatform === 'ios' ? <IosPreview /> : null}
          {selectedPlatform === 'android' ? <AndroidPreview /> : null}
          {selectedPlatform === 'windows' || selectedPlatform === 'macos' ? (
            <DesktopPreview />
          ) : null}
          <div className="music-promo__sync-line" aria-hidden="true">
            <Cloud size={14} />
            已同步
          </div>
        </div>
      </section>

      <section className="music-promo__platform-band" aria-labelledby="platform-title">
        <div className="music-promo__section-heading">
          <p>Choose your player</p>
          <h2 id="platform-title">选择你的播放设备</h2>
        </div>
        <div className="music-promo__platforms">
          {platforms.map(({ id, label, icon: Icon, requirement }) => (
            <button
              key={id}
              type="button"
              className={selectedPlatform === id ? 'is-active' : undefined}
              onClick={() => {
                setSelectedPlatform(id)
                document.querySelector('.music-promo__hero')?.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              <span className="music-promo__platform-icon">
                <Icon size={22} aria-hidden="true" />
              </span>
              <span>
                <strong>{label}</strong>
                <small>{requirement}</small>
              </span>
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>

      <section className="music-promo__feature-section" aria-labelledby="features-title">
        <div className="music-promo__section-heading music-promo__section-heading--split">
          <div>
            <p>One library, everywhere</p>
            <h2 id="features-title">你的音乐，不被设备困住</h2>
          </div>
          <p>四端共享同一套核心能力，并针对触屏、键鼠和系统播放控制分别优化。</p>
        </div>
        <div className="music-promo__features">
          {featureGroups.map(({ icon: Icon, title, description }) => (
            <article key={title}>
              <Icon size={21} aria-hidden="true" />
              <strong>{title}</strong>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        id="platform-install"
        className="music-promo__install"
        aria-labelledby="install-title"
      >
        <div className="music-promo__install-intro">
          <span className="music-promo__install-icon">
            <PlatformIcon size={28} aria-hidden="true" />
          </span>
          <p>{platform.eyebrow}</p>
          <h2 id="install-title">{platform.title}</h2>
          <p>{platform.description}</p>
          <dl>
            <div>
              <dt>系统要求</dt>
              <dd>{platform.requirement}</dd>
            </div>
            <div>
              <dt>安装方式</dt>
              <dd>{platform.format}</dd>
            </div>
            {selectedPlatform === 'android' ? (
              <div>
                <dt>当前版本</dt>
                <dd>{installerError ? `${androidVersion} · 备用信息` : androidVersion}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="music-promo__install-flow">
          <ol>
            {installNotes[selectedPlatform].map((note, index) => (
              <li key={note}>
                <span>{index + 1}</span>
                <div>
                  <strong>{note}</strong>
                  <Check size={16} aria-hidden="true" />
                </div>
              </li>
            ))}
          </ol>
          {selectedPlatform === 'ios' ? (
            <p className="music-promo__availability">
              此 IPA 未签名，不能在 iPhone 或 iPad 上直接点击安装。
              请在电脑上使用签名工具安装；需要即开即用时，可先使用网页版。
            </p>
          ) : null}
          {selectedPlatform === 'macos' ? (
            <p className="music-promo__availability">
              当前提供 v{DESKTOP_VERSION} 原版测试包，存在已知签名问题。
              直连下载不会修复签名；建议先使用网页版，等待签名修复版本。
            </p>
          ) : null}
          <a
            className="music-promo__download music-promo__download--wide"
            href={download.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Download size={18} />
            {download.label}
          </a>
        </div>
      </section>

      <footer className="music-promo__footer">
        <div>
          <img src={siteImages.musicIcon.url} alt="" />
          <span>
            <strong>柒伍壹壹音乐</strong>
            <small>让音乐跟着你走。</small>
          </span>
        </div>
        <Link to="/music">打开网页版播放器</Link>
      </footer>
    </main>
  )
}

function DesktopPreview() {
  return (
    <div className="music-promo__desktop" aria-label="DuckMusic 桌面端界面预览">
      <div className="music-promo__window-bar">
        <span />
        <span />
        <span />
        <strong>DuckMusic</strong>
      </div>
      <div className="music-promo__desktop-body">
        <aside>
          <div className="music-promo__app-mark">
            <img src={siteImages.musicIcon.url} alt="" />
            <strong>7511</strong>
          </div>
          <nav>
            <span className="is-active"><Music2 size={12} /> 首页</span>
            <span><Search size={12} /> 搜索</span>
            <span><Disc3 size={12} /> 发现</span>
            <span><ListMusic size={12} /> 资料库</span>
          </nav>
          <p>我的音乐</p>
          <nav>
            <span><Heart size={12} /> 喜欢的音乐</span>
            <span><ListMusic size={12} /> 播放历史</span>
          </nav>
        </aside>
        <div className="music-promo__desktop-content">
          <header>
            <div>
              <small>晚上好</small>
              <strong>继续听点喜欢的</strong>
            </div>
            <Search size={15} />
          </header>
          <div className="music-promo__radio-card">
            <div>
              <small>私人电台</small>
              <strong>熟悉的旋律，新的相遇</strong>
              <span><Play size={11} fill="currentColor" /> 随机播放</span>
            </div>
            <Disc3 size={66} strokeWidth={1.3} />
          </div>
          <div className="music-promo__song-head">
            <strong>正在流行</strong>
            <span>查看全部</span>
          </div>
          <div className="music-promo__song-list">
            {songs.map((song, index) => (
              <div key={song.title} className={index === 0 ? 'is-playing' : undefined}>
                <span className="music-promo__cover" style={{ '--cover': song.color } as React.CSSProperties}>
                  {index === 0 ? <Pause size={10} fill="currentColor" /> : index + 1}
                </span>
                <span>
                  <strong>{song.title}</strong>
                  <small>{song.artist}</small>
                </span>
                <small>{song.time}</small>
                <MoreHorizontal size={13} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="music-promo__desktop-player">
        <span className="music-promo__player-cover"><Music2 size={16} /></span>
        <span><strong>晴天</strong><small>周杰伦</small></span>
        <span className="music-promo__player-controls">
          <Play size={15} fill="currentColor" />
        </span>
        <span className="music-promo__player-progress"><i /></span>
      </div>
    </div>
  )
}

function AndroidPreview() {
  return (
    <div className="music-promo__mobile" aria-label="DuckMusic Android 界面预览">
      <div className="music-promo__mobile-speaker" />
      <div className="music-promo__mobile-screen">
        <header>
          <img src={siteImages.musicIcon.url} alt="" />
          <span><small>晚上好</small><strong>为你推荐</strong></span>
          <Search size={14} />
        </header>
        <div className="music-promo__mobile-feature">
          <span>DAILY MIX</span>
          <strong>今天，听点熟悉的</strong>
          <button type="button" tabIndex={-1} aria-hidden="true"><Play size={11} fill="currentColor" /></button>
        </div>
        <strong className="music-promo__mobile-title">最近播放</strong>
        <div className="music-promo__mobile-albums">
          {songs.slice(0, 3).map((song) => (
            <div key={song.title}>
              <span style={{ '--cover': song.color } as React.CSSProperties}><Music2 size={13} /></span>
              <strong>{song.title}</strong>
              <small>{song.artist}</small>
            </div>
          ))}
        </div>
        <div className="music-promo__mobile-player">
          <span><Music2 size={12} /></span>
          <div><strong>晴天</strong><small>周杰伦</small></div>
          <Pause size={13} fill="currentColor" />
        </div>
        <nav>
          <span className="is-active"><Music2 size={12} />首页</span>
          <span><Disc3 size={12} />发现</span>
          <span><Search size={12} />搜索</span>
          <span><Heart size={12} />我的</span>
        </nav>
      </div>
    </div>
  )
}

function IosPreview() {
  return (
    <div className="music-promo__ios" aria-label="DuckMusic iOS 界面预览">
      <img
        src={siteImages.iosHome.url}
        alt="DuckMusic 在 iPhone 17 Pro 模拟器中的真实首页，包含每日推荐、最新专辑和四栏导航"
        decoding="async"
      />
    </div>
  )
}
