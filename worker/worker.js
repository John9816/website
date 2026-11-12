// 学城编辑器 · Cloudflare Workers 入口
// 把 Fetch Request 适配成仓库 handleApi 所需的 req/res shim，并在请求边界加载/落库 D1。
import { ENV, setEnv, setCtx, loadContext, saveContext } from "./context.js";
import { handleApi } from "./index.js";
import { handleUploadAudio, handleMedia } from "./media.js";

const PREFIX = "/editor";

function makeReq(request) {
  const headers = {};
  for (const [k, v] of request.headers) headers[k.toLowerCase()] = v;
  const ip =
    request.headers.get("cf-connecting-ip") ||
    headers["x-forwarded-for"]?.split(",")[0].trim() ||
    "";
  headers["x-forwarded-for"] = ip;
  return {
    method: request.method,
    url: request.url,
    headers,
    socket: { remoteAddress: ip },
    __request: request,
  };
}

function toResponse(resShim) {
  const status = resShim.status || 404;
  const payload =
    resShim.body || { code: status === 200 ? 0 : status, message: "Not Found", data: null };
  const h = new Headers();
  h.set("Content-Type", "application/json; charset=utf-8");
  h.set("Cache-Control", "no-store");
  if (resShim.cookies && resShim.cookies.length) {
    for (const c of resShim.cookies) h.append("set-cookie", c);
  }
  return new Response(JSON.stringify(payload), { status, headers: h });
}

export default {
  async fetch(request, env, ctx) {
    setEnv(env);
    const url = new URL(request.url);
    const p = url.pathname;

    // 音频上传：先于 /editor/api/* 的 handleApi 拦截（同源 R2 落点）
    if (p === "/editor/api/upload/audio" && request.method === "POST") {
      const reqShim = makeReq(request);
      const resShim = { cookies: [] };
      await handleUploadAudio(reqShim, env, resShim);
      return toResponse(resShim);
    }

    // 同源媒体流出：先于 ASSETS 回退拦截（/editor/media/* 不属 /editor/api/）
    if (p.startsWith("/editor/media/")) {
      return handleMedia(request, env);
    }

    // API：/editor/api/* 由 handleApi 处理（路由去掉 /editor 前缀，交给仓库逻辑）
    if (p === "/editor/api" || p.startsWith("/editor/api/")) {
      const reqShim = makeReq(request);
      const resShim = { cookies: [] };
      const route = p.startsWith(PREFIX) ? p.slice(PREFIX.length) : p;
      try {
        setCtx(await loadContext(env));
        const out = await handleApi(reqShim, resShim, route);
        await saveContext(env);
        return toResponse(out || resShim);
      } catch (e) {
        console.error("handleApi failed:", e && e.message, (e && e.stack) || "");
        return new Response(
          JSON.stringify({ code: 500, message: "服务器内部错误" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // 静态资源：剥离 /editor 前缀交给 Workers Assets
    const assetUrl = new URL(request.url);
    if (p === PREFIX) assetUrl.pathname = "/";
    else if (p.startsWith(PREFIX + "/")) assetUrl.pathname = p.slice(PREFIX.length);
    else assetUrl.pathname = p;
    if (assetUrl.pathname === "") assetUrl.pathname = "/";
    const assetReq = new Request(assetUrl.toString(), request);
    return env.ASSETS.fetch(assetReq);
  },
};
