import { Popover } from 'antd'
import { Palette } from 'lucide-react'
import { useMusicAppearance } from '../../utils/musicAppearance'

/** 音乐页外观入口：液体背景 / 动效开关。播放页主题跟随全站亮暗。 */
export default function MusicAppearanceMenu() {
  const appearance = useMusicAppearance()

  const content = (
    <div className="music-appearance">
      <div className="music-appearance__head">
        <strong>外观设置</strong>
        <span>仅作用于音乐页</span>
      </div>

      <div className="music-appearance__group">
        <small>动效</small>
        <button
          type="button"
          className="music-appearance__row"
          onClick={() => appearance.setLiquid(!appearance.liquid)}
          aria-pressed={appearance.liquid}
        >
          <span>
            <b>液体背景</b>
            <em>随当前封面主色缓慢流动</em>
          </span>
          <i
            className={`music-appearance__switch${
              appearance.liquid ? ' is-on' : ''
            }`}
          />
        </button>
        <button
          type="button"
          className="music-appearance__row"
          onClick={() => appearance.setMotion(!appearance.motion)}
          aria-pressed={appearance.motion}
        >
          <span>
            <b>漂移动画</b>
            <em>关闭后保留静态色斑与全部功能</em>
          </span>
          <i
            className={`music-appearance__switch${
              appearance.motion ? ' is-on' : ''
            }`}
          />
        </button>
      </div>

      <p className="music-appearance__foot">
        设置保存在本机浏览器。系统开启「减少动态效果」时会自动降级为静态。
      </p>
    </div>
  )

  return (
    <Popover
      content={content}
      trigger="click"
      placement="bottomRight"
      overlayClassName="music-appearance-popover"
    >
      <button
        type="button"
        className="music-studio-icon"
        aria-label="外观设置"
        title="外观设置"
      >
        <Palette size={19} />
      </button>
    </Popover>
  )
}
