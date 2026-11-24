import { useRef } from 'react'
import { App, Button, Popover, Switch } from 'antd'
import { Captions } from 'lucide-react'
import { useMusicPlayer } from '../context/MusicPlayerContext'
export default function MusicLyricsSettings() {
  const player = useMusicPlayer()
  const file = useRef<HTMLInputElement>(null)
  const {message} = App.useApp()
  return <Popover trigger="click" placement="topRight" content={<div className="music-lyrics-settings">
    <label><span>优先使用在线 TTML</span><Switch aria-label="优先使用在线 TTML" checked={player.preferTtml} onChange={player.setPreferTtml} /></label>
    <p>网易云、QQ 已收录歌曲显示逐字歌词、翻译与罗马音。未收录时使用原歌词。</p>
    <label><span>蓝牙歌词 / 系统歌词</span><Switch aria-label="蓝牙歌词 / 系统歌词" disabled={!player.mediaSessionSupported} checked={player.bluetoothLyrics} onChange={player.setBluetoothLyrics} /></label>
    <p>{player.mediaSessionSupported ? '将当前歌词同步到系统媒体标题。锁屏和车机能否显示取决于浏览器及设备；无需在网页配对蓝牙。' : '当前浏览器不支持系统媒体信息，请使用支持 Media Session 的浏览器。'}</p>
    <div className="music-lyrics-settings__files"><Button size="small" onClick={() => file.current?.click()}>导入 TTML / LRC</Button>{player.hasLocalLyrics && <Button size="small" onClick={player.clearLocalLyrics}>恢复在线歌词</Button>}</div>
    <p>本地歌词只应用于当前歌曲，切歌后清除。</p>
  </div>}>
    <button type="button" className="music-lyrics-settings__trigger" aria-label="歌词设置" title="歌词设置"><Captions size={17} /><span>{player.ttmlLoading ? '歌词加载中' : player.lyricFormat}</span>
      <input ref={file} type="file" accept=".ttml,.lrc" hidden onClick={e => e.stopPropagation()} onChange={async e => {
        const selected = e.target.files?.[0]; e.target.value = ''; if (!selected) return
        const apply = player.setLocalLyrics
        try { if (selected.size > 1024 * 1024) throw new Error('歌词文件不能超过 1 MB'); apply(await selected.text(), selected.name); message.success('歌词已载入') }
        catch(error) { message.error(error instanceof Error ? error.message : '歌词导入失败') }
      }} />
    </button>
  </Popover>
}
