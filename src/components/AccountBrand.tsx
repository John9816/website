import { BookOpen, Compass, Music2, Sparkles } from 'lucide-react'
import { siteImages } from '../utils/siteImages'

/** 认证页（登录 / 注册 / 找回密码）左侧品牌面板：找回品牌感，PC 分栏、H5 顶部品牌带。 */
export default function AccountBrand() {
  return (
    <aside className="account-brand" aria-hidden="true">
      <div className="account-brand__top">
        <img className="account-brand__logo" src={siteImages.logo.url} alt="" width={40} height={40} />
        <span className="account-brand__word">oldwang<span>.</span></span>
      </div>

      <div className="account-brand__body">
        <p className="account-brand__eyebrow">OLDWANG WORKSPACE</p>
        <h2 className="account-brand__title">
          收藏好用的，<br />连接有趣的<span>.</span>
        </h2>
        <p className="account-brand__desc">一个账号，畅游导航、音乐、AI 对话与文档。</p>
        <ul className="account-brand__features">
          <li><Compass size={16} /> 个人导航</li>
          <li><Music2 size={16} /> 在线音乐</li>
          <li><Sparkles size={16} /> AI 创作</li>
          <li><BookOpen size={16} /> 学城文档</li>
        </ul>
      </div>

      <div className="account-brand__foot">751152.xyz · 个人工作台</div>

      <span className="account-brand__orb account-brand__orb--1" />
      <span className="account-brand__orb account-brand__orb--2" />
      <span className="account-brand__grid" />
    </aside>
  )
}
