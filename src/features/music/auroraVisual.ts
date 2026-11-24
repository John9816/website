import { FastAverageColor } from 'fast-average-color'

/**
 * Aurora Live · 极光现场 —— 视觉工具层
 *
 * 设计约束（与 /music/now 播放页约定）：
 *  - 不触碰 playUrl / directUrl / playAuth，不参与任何音频传输与解密。
 *  - 只做「装饰性」环境光：从已加载的小尺寸封面缩略图经 canvas 取色
 *    （FastAverageColor 内部会把图片绘制到 canvas 再取样），派生一组邻近
 *    色相的低分辨率 CSS 渐变光晕，绝不重复请求大图、绝不用大面积实时高半径
 *    blur、绝不堆砌 backdrop-filter、绝不引入任何新依赖或 3D/Canvas 引擎。
 *  - 所有动效都是纯装饰，不代表真实音频频谱（无法可靠拿到 WebAudio 数据）。
 */

export type AuroraPalette = {
  /** 主光 · "r, g, b"，可直接喂给 rgb()/rgba() */
  a: string
  /** 邻近暖色光 */
  b: string
  /** 邻近冷色/深光 */
  c: string
  /** 原始主色 · 用于 --now-glow 及歌词高亮等强调色 */
  dominant: string
}

const fac = new FastAverageColor()

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return [h * 360, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hh = (((h % 360) + 360) % 360) / 360
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [
    Math.round(channel(hh + 1 / 3) * 255),
    Math.round(channel(hh) * 255),
    Math.round(channel(hh - 1 / 3) * 255),
  ]
}

const rgbString = ([r, g, b]: [number, number, number]) => `${r}, ${g}, ${b}`

/**
 * 由单个主色派生「极光」三色：色相只在 ±34° 内邻近摆动，饱和度和明度被
 * 夹紧在柔和区间，避免廉价霓虹堆砌；亮/暗主题的最终观感由 CSS 主题变量控制。
 */
export function deriveAuroraPalette([r, g, b]: [number, number, number]): AuroraPalette {
  const [h, s, l] = rgbToHsl(r, g, b)
  const baseS = clamp(s, 0.18, 0.62)
  const baseL = clamp(l, 0.42, 0.66)
  const a = hslToRgb(h, baseS * 0.9, clamp(baseL + 0.06, 0, 0.74))
  const bStar = hslToRgb(h + 34, baseS * 0.82, clamp(baseL - 0.02, 0.28, 0.62))
  const cStar = hslToRgb(h - 30, baseS * 0.78, clamp(baseL - 0.1, 0.24, 0.56))
  return {
    a: rgbString(a),
    b: rgbString(bStar),
    c: rgbString(cStar),
    dominant: rgbString([r, g, b]),
  }
}

/**
 * 从一个已加载的小尺寸封面缩略图取色。getColorAsync 内部会创建带
 * crossOrigin 的 Image 并绘制到 canvas 取样；该缩略图与主封面共用浏览器
 * 缓存（非汽水音源时甚至是同一个 URL），因此不会重复请求大图。
 * 失败时返回 null，调用方应平滑降级到主题强调色，且不得影响播放。
 */
export async function extractAurora(url: string): Promise<AuroraPalette | null> {
  const color = await fac.getColorAsync(url, {
    algorithm: 'dominant',
    crossOrigin: 'anonymous',
  })
  const [r, g, b] = color.value
  return deriveAuroraPalette([r, g, b])
}

/** 低性能设备保守降级：仅据此降低装饰动效与默认光强，绝不阻断播放。 */
export function lowPowerDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string }
    deviceMemory?: number
    hardwareConcurrency?: number
  }
  const conn = nav.connection
  if (conn?.saveData) return true
  if (conn?.effectiveType && /^(slow-)?2g$/.test(conn.effectiveType)) return true
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) return true
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 2) return true
  return false
}

/* ---------- 用户设置：环境光强度（localStorage 持久化） ---------- */

export type GlowLevel = 0 | 1 | 2 | 3 // 关闭 / 柔和 / 标准 / 明亮

const GLOW_KEY = 'aurora-now.glow'

export const GLOW_OPTIONS: Array<{ level: GlowLevel; label: string }> = [
  { level: 0, label: '关闭' },
  { level: 1, label: '柔和' },
  { level: 2, label: '标准' },
  { level: 3, label: '明亮' },
]

/** .now-page__ambient 的整体不透明度，作为光强缩放系数。 */
export const GLOW_INTENSITY: Record<GlowLevel, number> = {
  0: 0,
  1: 0.5,
  2: 0.82,
  3: 1.1,
}

export function readGlowLevel(lowPower = false): GlowLevel {
  try {
    const raw = window.localStorage.getItem(GLOW_KEY)
    if (raw === '0' || raw === '1' || raw === '2' || raw === '3') {
      return Number(raw) as GlowLevel
    }
  } catch {
    // 隐私模式下仍可用，只是不跨会话保留
  }
  return lowPower ? 1 : 2
}

export function writeGlowLevel(level: GlowLevel): void {
  try {
    window.localStorage.setItem(GLOW_KEY, String(level))
  } catch {
    // 忽略写入失败，不影响播放与当前会话
  }
}
