import type { TimedLyricLine } from '../utils/musicLyrics'
export default function MusicLyricText({line, time, active}: {line:TimedLyricLine; time:number; active:boolean}) {
  return <span className="music-lyric-text">
    <span>{line.words?.length ? line.words.map((word, i) => <span key={i} className={active ? `music-lyric-word${time >= word.end ? ' is-sung' : time >= word.time ? ' is-singing' : ''}` : undefined}>{word.text}</span>) : line.text || '\u00A0'}</span>
    {line.translation && <small className="music-lyric-translation">{line.translation}</small>}
    {line.romanization && <small className="music-lyric-romanization">{line.romanization}</small>}
  </span>
}
