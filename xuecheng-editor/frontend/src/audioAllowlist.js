/**
 * 音频来源安全白名单与解析
 * 平台嵌入（iframe）路径不接受客户端原始 HTML：只抽取 src 并校验域名白名单，
 * 由 schema 的 audio 节点 toDOM 用安全模板重包，杜绝 XSS / on* / javascript: 注入。
 */

// 允许做音频嵌入的平台域名（与浏览器 iframe 嵌入码一致）
export const EMBED_HOSTS = [
  "music.163.com", // 网易云音乐 outchain 播放器
  "player.bilibili.com", // B 站播放器
  "www.bilibili.com",
  "bilibili.com",
  "i.y.qq.com", // QQ 音乐
  "y.qq.com",
  "c.y.qq.com",
];

// 允许的直链音频扩展名
export const AUDIO_EXT = ["mp3", "m4a", "wav", "ogg", "oga", "aac", "flac", "weba", "mka"];

function hostOf(u) {
  try {
    return new URL(u).host.toLowerCase();
  } catch (_) {
    return "";
  }
}

function isAllowedEmbedHost(host) {
  return EMBED_HOSTS.includes(host);
}

/**
 * 从「裸 URL」或「<iframe ...> 嵌入代码」中抽取播放器地址。
 * 仅当域名命中白名单才返回 { src, provider }，否则返回 null（拒绝一切非法来源）。
 */
export function parseEmbedSrc(input) {
  if (!input || typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw) return null;

  let src = null;
  // 1) 看起来是 iframe / 嵌入代码：抽取 src 属性
  const iframeM = /<iframe[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/i.exec(raw);
  if (iframeM) {
    src = iframeM[1].trim();
  } else {
    // 2) 裸链接（http/https）
    if (/^https?:\/\//i.test(raw)) src = raw;
  }
  if (!src) return null;

  const host = hostOf(src);
  if (!host) return null;
  // 拒绝任何非常规协议（javascript:, data:, 等）
  if (!/^https?:\/\//i.test(src)) return null;
  if (!isAllowedEmbedHost(host)) return null;

  let provider = "";
  if (host.includes("163.com")) provider = "netease";
  else if (host.includes("bilibili.com")) provider = "bilibili";
  else if (host.includes("y.qq.com") || host.includes("qq.com")) provider = "qq";

  return { src, provider };
}

/**
 * 校验「直链音频 URL」：仅允许 https 且以音频扩展名结尾，或同源 /editor/media/ 路径（本站上传）。
 * 返回规范化后的 src，非法返回 null。
 */
export function sanitizeAudioUrl(input) {
  if (!input || typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw) return null;

  // 同源上传路径
  if (raw.startsWith("/editor/media/")) {
    if (/\.\./.test(raw)) return null;
    return raw;
  }
  if (!/^https:\/\//i.test(raw)) return null; // 仅允许 https
  const host = hostOf(raw);
  if (!host) return null;
  const ext = raw.split("?")[0].split("#")[0].split(".").pop().toLowerCase();
  if (!AUDIO_EXT.includes(ext)) return null;
  return raw;
}
