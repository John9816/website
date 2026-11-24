import { siteImages } from '../utils/siteImages'
import { usePointerParallax } from '../hooks/usePointerParallax'

/** 认证页（登录 / 注册 / 找回密码）左侧品牌面板：找回品牌感，PC 分栏、H5 顶部品牌带。 */
export default function AccountBrand() {
  const brandRef = usePointerParallax<HTMLElement>()
  return (
    <aside className="account-brand" ref={brandRef} aria-hidden="true">
      <div className="account-brand__top">
        <img className="account-brand__logo" src={siteImages.logo.url} alt="" width={40} height={40} />
        <span className="account-brand__word">oldwang<span>.</span></span>
      </div>

      <span className="account-brand__orb account-brand__orb--1" />
      <span className="account-brand__orb account-brand__orb--2" />
      <span className="account-brand__grid" />
    </aside>
  )
}
