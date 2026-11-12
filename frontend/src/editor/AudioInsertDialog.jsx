/**
 * 音频/歌曲插入对话框
 * 三种来源：
 *  - 直链音频：粘贴 .mp3/.m4a 等音频直链（https）
 *  - 平台嵌入：粘贴网易云/B站/QQ音乐的 iframe 嵌入代码或链接（域名白名单校验）
 *  - 本地上传：选本地音频文件，上传到 R2 后生成同源播放器
 * 安全：嵌入路径只抽取 src 并校验白名单，绝不使用客户端原始 HTML。
 */
import { useState } from "react";
import { api } from "../api.js";
import { sanitizeAudioUrl, parseEmbedSrc } from "../audioAllowlist.js";
import { insertAudio } from "./commands.js";

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("读取文件失败"));
    r.readAsDataURL(file);
  });
}

export default function AudioInsertDialog({ view, onClose }) {
  const [mode, setMode] = useState("url"); // url | embed | upload
  const [url, setUrl] = useState("");
  const [embed, setEmbed] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const doInsert = (attrs) => {
    try {
      insertAudio(view, attrs);
      view?.focus();
      onClose();
    } catch (e) {
      setErr("插入失败：" + (e?.message || "请重试"));
    }
  };

  const insertUrl = () => {
    setErr("");
    const clean = sanitizeAudioUrl(url);
    if (!clean) {
      setErr("请输入合法的 https 音频直链（.mp3/.m4a/.wav 等），或本站上传得到的 /editor/media/ 链接");
      return;
    }
    doInsert({ src: clean, kind: "audio", title: url.split("/").pop().slice(0, 60) });
  };

  const insertEmbed = () => {
    setErr("");
    const parsed = parseEmbedSrc(embed);
    if (!parsed) {
      setErr("无法识别：仅支持网易云、B站、QQ音乐的 iframe 嵌入代码或分享链接");
      return;
    }
    doInsert({ src: parsed.src, kind: "embed", provider: parsed.provider, title: "" });
  };

  const uploadAndInsert = async () => {
    setErr("");
    if (!file) {
      setErr("请先选择本地音频文件");
      return;
    }
    if (!/^audio\//.test(file.type) && !/\.(mp3|m4a|wav|ogg|oga|aac|flac|weba|mka)$/i.test(file.name)) {
      setErr("仅支持音频文件（mp3 / m4a / wav / ogg / aac / flac 等）");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await readFileAsDataURL(file);
      const r = await api.uploadAudio(dataUrl, file.name);
      const u = (r && r.url) || (r && r.data && r.data.url);
      if (!u) throw new Error("上传未返回链接");
      doInsert({ src: u, kind: "audio", title: file.name.slice(0, 60) });
    } catch (e) {
      setErr("上传失败：" + (e?.message || "请稍后重试"));
      setBusy(false);
    }
  };

  const onKey = (e) => {
    if (e.key === "Escape") onClose();
  };

  return (
    <div className="share-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true">
      <div className="share-modal audio-modal" onKeyDown={onKey}>
        <div className="share-modal-head">
          <div>
            <h3>插入音频 / 歌曲 🎵</h3>
            <p className="share-modal-sub">支持直链、平台嵌入（网易云/B站/QQ音乐）或本地上传，分享页免登录即可播放</p>
          </div>
          <button className="share-x" onClick={onClose} title="关闭">×</button>
        </div>

        <div className="aud-seg">
          {[
            { k: "url", label: "直链音频" },
            { k: "embed", label: "平台嵌入" },
            { k: "upload", label: "本地上传" },
          ].map((m) => (
            <button
              key={m.k}
              className={"aud-seg-btn" + (mode === m.k ? " active" : "")}
              onClick={() => { setMode(m.k); setErr(""); }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === "url" && (
          <div className="aud-row">
            <input
              className="aud-input"
              placeholder="https://example.com/song.mp3"
              value={url}
              autoFocus
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && insertUrl()}
            />
            <button className="share-btn primary" onClick={insertUrl}>插入</button>
          </div>
        )}

        {mode === "embed" && (
          <div className="aud-col">
            <textarea
              className="aud-textarea"
              placeholder={"粘贴平台嵌入代码或链接，例如：\n<iframe src=\"https://music.163.com/outchain/player?type=2&id=...\"></iframe>\n或 https://player.bilibili.com/player.html?bvid=..."}
              value={embed}
              rows={4}
              onChange={(e) => setEmbed(e.target.value)}
            />
            <button className="share-btn primary" onClick={insertEmbed}>插入</button>
            <p className="aud-hint">仅支持白名单域名：网易云 music.163.com、B站 player.bilibili.com、QQ音乐 i.y.qq.com。其他来源会被拒绝，避免安全风险。</p>
          </div>
        )}

        {mode === "upload" && (
          <div className="aud-col">
            <input
              className="aud-file"
              type="file"
              accept="audio/*,.mp3,.m4a,.wav,.ogg,.oga,.aac,.flac,.weba,.mka"
              onChange={(e) => setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
            />
            <button className="share-btn primary" disabled={busy || !file} onClick={uploadAndInsert}>
              {busy ? "上传中…" : "上传并插入"}
            </button>
            <p className="aud-hint">文件上传到本站 R2 存储，生成同源播放器，分享页可直接播放、无需登录。</p>
          </div>
        )}

        {err && <div className="share-err">{err}</div>}
      </div>
    </div>
  );
}
