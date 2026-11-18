/**
 * 顶栏「正在看的人」头像组。
 *
 * 数据来自 /api/docs/:id/presence（登录态）或 /api/share/:token/presence（匿名分享页）：
 * 首次立即上报，之后每 15s 心跳维持在线；切走文档 / 关闭页面主动注销，
 * 服务端 40s TTL 兜底。在线状态属于非关键能力，任何失败都静默，不影响编辑。
 *
 * 大厂惯例：自己的头像带蓝环并排在最前，其余参与者按名字稳定排序，
 * 匿名访客聚合成一个灰色头像，超过 4 个折叠为 +N。
 */
import { useEffect, useState } from "react";
import { api } from "./api.js";

const BEAT_MS = 15000;
const MAX_SHOW = 4;

export default function PresenceAvatars({ docId, shareToken, compact = false }) {
  const [data, setData] = useState({ viewers: [], guests: 0, total: 0 });

  useEffect(() => {
    if (!docId && !shareToken) return undefined;
    let alive = true;

    const ping = async () => {
      try {
        const r = shareToken
          ? await api.presence.sharePing(shareToken)
          : await api.presence.ping(docId);
        if (!alive || !r) return;
        setData({
          viewers: Array.isArray(r.viewers) ? r.viewers : [],
          guests: Number(r.guests) || 0,
          total: Number(r.total) || 0,
        });
      } catch (_) {
        /* 静默：在线头像失败不该打断编辑或弹错误 */
      }
    };

    const leave = () => {
      const p = shareToken
        ? api.presence.shareLeave(shareToken)
        : api.presence.leave(docId);
      p.catch(() => {});
    };

    ping();
    const timer = setInterval(ping, BEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };
    const onPageHide = () => leave();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onPageHide);
      leave();
    };
  }, [docId, shareToken]);

  const { viewers, guests, total } = data;

  /* 匿名访客聚合成一枚灰色头像，避免一屏占位头像 */
  const all = [...viewers];
  if (guests > 0) {
    all.push({
      guest: true,
      count: guests,
      name: `${guests} 位访客`,
      color: "#8f959e",
      initial: "访",
    });
  }
  const shown = all.slice(0, MAX_SHOW);
  const rest = all.length - shown.length;

  const names = viewers.map((v) => v.name + (v.self ? "（我）" : ""));
  if (guests > 0) names.push(`${guests} 位访客`);
  const tip =
    total <= 1
      ? "当前只有你在看这篇文档"
      : `${total} 人正在看 · ${names.slice(0, 6).join("、")}${names.length > 6 ? "…" : ""}`;

  return (
    <div
      className={"presence" + (compact ? " presence--compact" : "")}
      data-tip={tip}
      aria-label={tip}
      role="status"
    >
      <span className="presence-dot" />
      <div className="presence-avs">
        {shown.map((v, i) => (
          <span
            key={v.guest ? "guest" : v.id || i}
            className={
              "presence-av" +
              (v.self ? " is-self" : "") +
              (v.guest ? " is-guest" : "")
            }
            style={{ background: v.color, zIndex: shown.length - i }}
          >
            {v.initial}
          </span>
        ))}
        {rest > 0 && <span className="presence-av presence-more">+{rest}</span>}
      </div>
    </div>
  );
}
