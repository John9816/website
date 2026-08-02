import { useEffect, useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeft,
  Cloud,
  Download,
  Headphones,
  ListMusic,
  Mic2,
  Radio,
  Search,
  Smartphone,
  Sparkles,
  Tv,
  Wand2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  getLatestMusicInstaller,
  type MusicInstallerReleaseView,
} from '../api/public'

/** Mirrors the Android app product at D:\Projects\music (柒伍壹壹音乐 / DuckMusic). */
const FALLBACK_INSTALLER: MusicInstallerReleaseView = {
  version: '1.1.24',
  buildNumber: 35,
  title: '柒伍壹壹音乐',
  channel: 'DuckMusic',
  fileName: 'DuckMusic-v1.1.24-arm64-v8a.apk',
  downloadUrl: 'https://api.751152.xyz/updates/DuckMusic-v1.1.24-arm64-v8a.apk',
  releasedAt: '2026-07-31',
  notes:
    'Android 音乐客户端：多音源搜索播放、榜单歌单、云端收藏与历史、歌词队列、网络电台与电视直播、AI 生图与视频解析。',
  platform: 'Android',
  minAndroid: '8.0',
  packageName: 'com.music.player',
}

const highlights: Array<{ icon: LucideIcon; title: string; description: string }> = [
  {
    icon: Search,
    title: '多音源搜索',
    description: '红源 / 绿源 / 橙源聚合搜索，找歌、找歌手、找歌单一处完成。',
  },
  {
    icon: ListMusic,
    title: '榜单与歌单',
    description: '排行榜、精选歌单、每日推荐，打开就能听热门内容。',
  },
  {
    icon: Cloud,
    title: '云端同步',
    description: '登录后收藏、播放历史与自建/导入歌单与网站账号同步。',
  },
  {
    icon: Mic2,
    title: '歌词与后台播放',
    description: '歌词页、播放队列、通知栏控制，熄屏也能继续听。',
  },
  {
    icon: Headphones,
    title: '音质与下载',
    description: '首选音质、移动网络策略、离线下载管理，流量与听感可控。',
  },
  {
    icon: Sparkles,
    title: '主题与细节',
    description: '深浅色与换肤、睡眠定时、均衡器，按自己的习惯调。',
  },
]

const tools: Array<{ icon: LucideIcon; title: string; description: string }> = [
  {
    icon: Radio,
    title: '网络电台',
    description: '全国广播电台直播，随时切换。',
  },
  {
    icon: Tv,
    title: '电视直播',
    description: 'IPTV 频道源，工具箱一键进入。',
  },
  {
    icon: Wand2,
    title: 'AI 生图',
    description: '文生图 / 本地参考图，可作歌单封面。',
  },
  {
    icon: Download,
    title: '视频解析',
    description: '抖音 / 快手 / 微博等直链解析。',
  },
]

const installSteps = [
  {
    title: '下载 APK',
    description: '点击下方按钮获取最新 arm64 安装包（DuckMusic 发布通道）。',
  },
  {
    title: '允许安装',
    description: '在系统设置中允许浏览器或文件管理器安装未知应用（仅本次安装）。',
  },
  {
    title: '安装并登录',
    description: '安装「柒伍壹壹音乐」后，用网站同一账号登录，即可同步收藏与歌单。',
  },
]

const mockNav = ['歌曲', '歌单', '搜索', '我的']

function formatSize(bytes?: number) {
  if (typeof bytes !== 'number' || bytes <= 0) return null
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

export default function MusicPromoPage() {
  const [installer, setInstaller] = useState<MusicInstallerReleaseView | null>(null)
  const [installerLoading, setInstallerLoading] = useState(true)
  const [installerError, setInstallerError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    setInstallerLoading(true)
    getLatestMusicInstaller()
      .then((data) => {
        if (!mounted) return
        setInstaller(data)
        setInstallerError(null)
      })
      .catch((error) => {
        if (!mounted) return
        setInstaller(FALLBACK_INSTALLER)
        setInstallerError((error as Error).message)
      })
      .finally(() => {
        if (mounted) setInstallerLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  const activeInstaller = installer ?? FALLBACK_INSTALLER
  const sizeLabel = formatSize(activeInstaller.sizeBytes)
  const versionLabel = useMemo(() => {
    const build =
      typeof activeInstaller.buildNumber === 'number' ? ` (${activeInstaller.buildNumber})` : ''
    return `v${activeInstaller.version}${build}`
  }, [activeInstaller])

  const specs = [
    activeInstaller.platform || 'Android',
    `Android ${activeInstaller.minAndroid || '8.0'}+`,
    activeInstaller.packageName || 'com.music.player',
    installerLoading ? '正在获取最新版本' : versionLabel,
    sizeLabel,
    installerError ? '已使用备用版本信息' : null,
  ].filter(Boolean) as string[]

  return (
    <main className="music-promo">
      <section className="music-promo__hero">
        <div className="music-promo__copy">
          <span className="music-promo__kicker">Android · DuckMusic</span>
          <h1>{activeInstaller.title || '柒伍壹壹音乐'}</h1>
          <p>
            专注简洁听歌体验的 Android 客户端。多音源搜索与播放、榜单歌单、云端收藏与历史、
            歌词队列后台播放，以及电台、电视直播、AI 生图等工具箱能力——与网站音乐页同一账号体系。
          </p>

          <div className="music-promo__actions">
            <a
              className="music-promo__download"
              href={activeInstaller.downloadUrl}
              download={activeInstaller.fileName}
              rel="noopener noreferrer"
            >
              <Download size={16} />
              下载 Android APK
            </a>
            <Link className="music-promo__back" to="/music">
              <ArrowLeft size={16} />
              返回网页听歌
            </Link>
          </div>

          <div className="music-promo__specs" aria-label="软件信息">
            {specs.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>

          {activeInstaller.notes ? (
            <p className="music-promo__notes">{activeInstaller.notes}</p>
          ) : null}
        </div>

        <div className="music-promo__device">
          <div className="music-promo__phone" aria-hidden="true">
            <div className="music-promo__phone-notch" />
            <div className="music-promo__phone-screen">
              <div className="music-promo__phone-header">
                <strong>柒伍壹壹音乐</strong>
                <span>今日推荐 · 继续播放</span>
              </div>
              <div className="music-promo__phone-cards">
                <article>
                  <span>每日推荐</span>
                  <strong>为你挑选的精选歌曲</strong>
                </article>
                <article>
                  <span>排行榜</span>
                  <strong>本周最热音乐</strong>
                </article>
                <article>
                  <span>工具箱</span>
                  <strong>电台 · 直播 · AI</strong>
                </article>
              </div>
              <div className="music-promo__phone-player">
                <div className="music-promo__phone-cover" />
                <div>
                  <strong>正在播放</strong>
                  <span>通知栏可控 · 后台不断</span>
                </div>
              </div>
              <nav className="music-promo__phone-nav">
                {mockNav.map((item, index) => (
                  <span key={item} className={index === 0 ? 'is-active' : undefined}>
                    {item}
                  </span>
                ))}
              </nav>
            </div>
          </div>
          <div className="music-promo__mobile">
            <Smartphone size={18} />
            <span>仅 Android 安装包 · 推荐 arm64 真机</span>
          </div>
        </div>
      </section>

      <section className="music-promo__features" aria-labelledby="music-promo-features-title">
        <div className="music-promo__section-head">
          <span className="music-promo__kicker">Features</span>
          <h2 id="music-promo-features-title">真实产品能力</h2>
          <p>与 Android 客户端同一套能力：不是占位文案，而是 App 里已经有的模块。</p>
        </div>
        <div className="music-promo__feature-grid">
          {highlights.map(({ icon: Icon, title, description }) => (
            <article key={title} className="music-promo__feature-card">
              <Icon size={18} />
              <div>
                <strong>{title}</strong>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="music-promo__tools" aria-labelledby="music-promo-tools-title">
        <div className="music-promo__section-head">
          <span className="music-promo__kicker">Tools</span>
          <h2 id="music-promo-tools-title">工具箱</h2>
        </div>
        <div className="music-promo__tool-grid">
          {tools.map(({ icon: Icon, title, description }) => (
            <article key={title} className="music-promo__tool-card">
              <Icon size={18} />
              <strong>{title}</strong>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="music-promo__install" aria-labelledby="music-promo-install-title">
        <div className="music-promo__section-head">
          <span className="music-promo__kicker">Install</span>
          <h2 id="music-promo-install-title">三步装上手机</h2>
        </div>
        <ol className="music-promo__steps">
          {installSteps.map((step, index) => (
            <li key={step.title}>
              <span className="music-promo__step-index">{index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="music-promo__install-cta">
          <a
            className="music-promo__download"
            href={activeInstaller.downloadUrl}
            download={activeInstaller.fileName}
            rel="noopener noreferrer"
          >
            <Download size={16} />
            {installerLoading ? '准备下载…' : `下载 ${activeInstaller.fileName}`}
          </a>
          <p>
            安装后可在设置中「检查更新」；更新通道与本页一致（
            <code>api.751152.xyz/updates</code>）。
          </p>
        </div>
      </section>
    </main>
  )
}
