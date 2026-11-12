// 音频上传（落 R2）与同源媒体流出（/editor/media/*）
// 由 worker.js 在路由边界直接调用，不经过 build.mjs（保持生成管线稳定）。
import { rndB64, b64ToBytes } from "./context.js";

const AUDIO_MIME_EXT = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/x-m4a": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/ogg": "ogg",
  "audio/oga": "oga",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/webm": "weba",
  "audio/x-matroska": "mka",
};

function json(resShim, status, data, message) {
  resShim.status = status;
  resShim.body = { code: status === 200 ? 0 : status, message: message || "", data: data || null };
}

/**
 * 音频上传：dataUrl → R2（xuecheng-files 桶），返回同源媒体 URL。
 * 与现有 /api/upload（图床）同风格：失败返回 502 + 明确原因，不静默降级。
 */
export async function handleUploadAudio(reqShim, env, resShim) {
  if (!env || !env.BUCKET) {
    json(resShim, 502, null, "媒体存储未配置，无法上传音频");
    return resShim;
  }
  let body = {};
  try {
    const text = await reqShim.__request.text();
    if (text) body = JSON.parse(text);
  } catch (_) {
    body = {};
  }
  const m = /^data:(audio\/[a-zA-Z0-9.+-]+);base64,(.+)$/i.exec(body.dataUrl || "");
  if (!m) {
    json(resShim, 400, null, "仅支持音频 dataUrl（audio/*）");
    return resShim;
  }
  const mime = m[1].toLowerCase();
  const ext = AUDIO_MIME_EXT[mime] || "mp3";
  const buf = b64ToBytes(m[2], "base64");

  let reason = "媒体存储暂时不可用，请稍后重试";
  try {
    const key = `audio/${rndB64(12)}.${ext}`;
    await env.BUCKET.put(key, buf, {
      contentType: mime,
      customMetadata: { uploadedAt: new Date().toISOString() },
    });
    json(resShim, 200, {
      url: `/editor/media/${key}`,
      name: body.name || `audio.${ext}`,
      kind: "audio",
    });
    return resShim;
  } catch (e) {
    reason = /timeout|abort/i.test(String((e && e.name) || "")) ? "媒体上传超时，请稍后重试" : "媒体存储连接失败，请稍后重试";
    console.warn("[audio-upload] failed:", e && e.message);
    json(resShim, 502, null, reason);
    return resShim;
  }
}

/**
 * 同源媒体流出：/editor/media/<key> → R2 对象。
 * 支持 Range（音频拖动/续传）。无 CORS 问题，分享页可直接 <audio> 播放。
 * 关键：Cloudflare R2 的 obj.body 是 ReadableStream（无 .slice()），
 * 故走 BUCKET.get(key, { range }) 让 R2 服务端切片，再读 obj.range。
 */
export async function handleMedia(request, env) {
  if (!env || !env.BUCKET) {
    return new Response("media storage not configured", { status: 502 });
  }
  const url = new URL(request.url);
  const key = decodeURIComponent(url.pathname.slice("/editor/media/".length));
  // 允许桶内前缀（如 audio/xxx.mp3），仅拦截路径穿越与绝对路径
  if (!key || key.startsWith("/") || key.includes("..") || key.includes("\\")) {
    return new Response("bad key", { status: 400 });
  }

  // 解析 Range 头，交给 R2 服务端切片
  const rangeHeader = request.headers.get("range");
  let getOpts;
  if (rangeHeader) {
    const mm = /bytes=(\d*)-(\d*)/i.exec(rangeHeader);
    if (mm) {
      const start = mm[1] ? parseInt(mm[1], 10) : 0;
      const end = mm[2] ? parseInt(mm[2], 10) : undefined;
      if (!Number.isNaN(start) && (end === undefined || end >= start)) {
        getOpts = { range: { offset: start, ...(end !== undefined ? { length: end - start + 1 } : {}) } };
      }
    }
  }

  // 先取全量对象拿「总大小」（Miniflare / 部分运行时 ranged get 不回填 size，全量 get 最可靠）
  let obj;
  try {
    obj = await env.BUCKET.get(key);
  } catch (e) {
    console.warn("[media] get failed:", e && e.message);
    return new Response("media fetch error", { status: 502 });
  }
  if (!obj) return new Response("not found", { status: 404 });
  const total = obj.size != null ? obj.size : (obj.range ? obj.range.size : 0);
  const contentType = obj.contentType || "application/octet-stream";

  // 需要切片时，再取一次 ranged（仅取 body；total 用上面的全量值，避免 Content-Range 缺总大小）
  if (getOpts) {
    let ranged;
    try {
      ranged = await env.BUCKET.get(key, getOpts);
    } catch (e) {
      console.warn("[media] ranged get failed:", e && e.message);
      return new Response("media fetch error", { status: 502 });
    }
    if (ranged) {
      const off = (ranged.range && ranged.range.offset) || 0;
      const len = (ranged.range && ranged.range.length) || 0;
      return new Response(ranged.body, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(len),
          "Content-Range": `bytes ${off}-${off + len - 1}/${total}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
  }

  return new Response(obj.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(total),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
