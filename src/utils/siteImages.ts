// 站点品牌图片：全部本地化到 public/brand（原 imgbb 外链在国内网络下频繁加载失败，
// 导致 logo 裂图）。本地路径走自有域名，稳定且可被 CDN 缓存。
// id 保留原 image_asset 编号，供后端数据兼容；url 改成本地静态路径。
export const siteImages = {
  musicIcon: { id: 1, url: '/brand/music-icon.png' },
  iosHome: { id: 2, url: '/brand/ios-home.png' },
  background: { id: 3, url: '/brand/background.webp' },
  logo: { id: 5, url: '/brand/logo.webp' },
  contact: { id: 6, url: '/brand/contact.webp' },
  sponsor: { id: 8, url: '/brand/sponsor.webp' },
} as const
