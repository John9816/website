/**
 * 主视图组件：主页 / 模板市场 / 知识广场 / 收藏空间
 * 与 App.jsx 通过回调交互（打开文档、使用模板、取消收藏等）
 */
import { useMemo, useState } from "react";

/* 相对时间（与 App 中一致，便于复用） */
function relTime(iso) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Math.max(0, Date.now() - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d} 天前` : new Date(t).toLocaleDateString("zh-CN");
}

/* 从 ProseMirror JSON 抽取纯文本片段，用于卡片预览 */
function plainText(node, max = 120) {
  let out = "";
  const walk = (n) => {
    if (!n || out.length >= max) return;
    if (typeof n === "string") {
      out += n;
      return;
    }
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (n.type === "text") out += n.text || "";
    else if (n.content) walk(n.content);
  };
  if (node && node.content) walk(node.content);
  return out.trim().slice(0, max) || "（空白文档）";
}

/* 文档行（用于主页列表） */
function DocRow({ doc, onOpen, onToggleFav, showStar }) {
  return (
    <div className={"doc-row" + (doc.active ? " active" : "")} onClick={() => onOpen(doc.id)}>
      <span className="doc-row-ico">▤</span>
      <span className="doc-row-main">
        <span className="doc-row-title">{doc.title || "未命名文档"}</span>
        <span className="doc-row-meta">{relTime(doc.updatedAt)}</span>
      </span>
      {showStar && (
        <button
          className={"row-star" + (doc.favorite ? " on" : "")}
          title={doc.favorite ? "取消收藏" : "收藏"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFav(doc.id);
          }}
        >
          {doc.favorite ? "★" : "☆"}
        </button>
      )}
    </div>
  );
}

/* 文档卡片（用于广场 / 收藏空间） */
function DocCard({ doc, onOpen, onToggleFav, showUnfav }) {
  return (
    <div className="doc-card" onClick={() => onOpen(doc.id)}>
      <div className="doc-card-top">
        <span className="doc-card-ico">▤</span>
        <button
          className={"card-star" + (doc.favorite ? " on" : "")}
          title={doc.favorite ? "取消收藏" : "收藏"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFav(doc.id);
          }}
        >
          {doc.favorite ? "★" : "☆"}
        </button>
      </div>
      <h3 className="doc-card-title">{doc.title || "未命名文档"}</h3>
      <p className="doc-card-snip">{doc.excerpt || plainText(doc.content) || "空白文档"}</p>
      <div className="doc-card-foot">
        <span>编辑于 {relTime(doc.updatedAt)}</span>
        {showUnfav && doc.favorite && (
          <button
            className="card-unfav"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFav(doc.id);
            }}
          >
            移出收藏
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------- 主页 ---------------- */
export function HomeView({ stats, edited, recents, favorites, onOpen, onNew, onToggleFav, onView }) {
  return (
    <div className="view home">
      <div className="view-head">
        <h1>👋 欢迎回到学城</h1>
        <p className="view-sub">你的知识工作台 · 今天也好好记录吧</p>
      </div>

      <div className="home-stats">
        <button className="stat" onClick={() => onView("square")} title="去知识广场看全部文档">
          <b>{stats.total}</b><span>文档总数</span>
        </button>
        <button className="stat" onClick={() => onView("favspace")} title="查看收藏空间">
          <b>{stats.favorites}</b><span>已收藏</span>
        </button>
        <button className="stat" onClick={() => onView("square")} title="去知识广场看最近访问">
          <b>{stats.recent}</b><span>最近访问</span>
        </button>
      </div>

      <div className="home-cols">
        <section className="home-col">
          <div className="home-col-head">
            <span>最近编辑</span>
            <button className="mini-btn" onClick={onNew}>＋ 新建</button>
          </div>
          <div className="doc-list">
            {edited.length ? (
              edited.map((d) => <DocRow key={d.id} doc={d} onOpen={onOpen} onToggleFav={onToggleFav} showStar />)
            ) : (
              <div className="doc-empty">还没有文档，点「新建」开始</div>
            )}
          </div>
        </section>

        <section className="home-col">
          <div className="home-col-head">
            <span>快速访问</span>
            <button className="mini-btn" onClick={() => onView("square")}>去广场</button>
          </div>
          <div className="doc-list">
            {recents.length ? (
              recents.map((d) => <DocRow key={d.id} doc={d} onOpen={onOpen} onToggleFav={onToggleFav} showStar />)
            ) : (
              <div className="doc-empty">打开过的文档会出现在这里</div>
            )}
          </div>
        </section>

        <section className="home-col">
          <div className="home-col-head">
            <span>我的收藏</span>
            <button className="mini-btn" onClick={() => onView("favspace")}>收藏空间</button>
          </div>
          <div className="doc-list">
            {favorites.length ? (
              favorites.map((d) => <DocRow key={d.id} doc={d} onOpen={onOpen} onToggleFav={onToggleFav} showStar />)
            ) : (
              <div className="doc-empty">点文档顶部的 ☆ 即可收藏</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------------- 模板市场 ---------------- */
function TplCard({ tpl, onPreview, onUse, onDelete }) {
  return (
    <div
      className="tpl-card"
      style={{ "--accent": tpl.accent }}
      role="button"
      tabIndex={0}
      onClick={() => onPreview(tpl)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPreview(tpl);
        }
      }}
    >
      <div className="tpl-ico">{tpl.icon || "📄"}</div>
      <h3>{tpl.name}</h3>
      <p>{tpl.desc || "你自己的文档模板"}</p>
      <div className="tpl-card-foot">
        <button
          className="tpl-peek"
          onClick={(e) => {
            e.stopPropagation();
            onPreview(tpl);
          }}
        >
          预览
        </button>
        <button
          className="tpl-use"
          onClick={(e) => {
            e.stopPropagation();
            onUse(tpl);
          }}
        >
          使用模板
        </button>
        {onDelete && (
          <button
            className="tpl-del"
            title="删除这个模板"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(tpl);
            }}
          >
            删除
          </button>
        )}
      </div>
    </div>
  );
}

export function TemplateMarket({ templates, myTemplates = [], onPreview, onUse, onDelete, onSaveCurrent }) {
  return (
    <div className="view tpl">
      <div className="view-head row">
        <div>
          <h1>模板市场</h1>
          <p className="view-sub">点卡片先看效果，满意再一键生成带结构的文档</p>
        </div>
        {onSaveCurrent && (
          <button className="view-head-btn" onClick={onSaveCurrent}>
            ＋ 把当前文档存为模板
          </button>
        )}
      </div>

      <div className="tpl-group-head">
        <span>内置模板</span>
        <i className="tpl-group-num">{templates.length}</i>
      </div>
      <div className="tpl-grid">
        {templates.map((tpl) => (
          <TplCard key={tpl.id} tpl={tpl} onPreview={onPreview} onUse={onUse} />
        ))}
      </div>

      <div className="tpl-group-head">
        <span>我的模板</span>
        <i className="tpl-group-num">{myTemplates.length}</i>
        <span className="tpl-group-tip">把整理好的文档存下来，下次新建直接复用结构</span>
      </div>
      {myTemplates.length ? (
        <div className="tpl-grid">
          {myTemplates.map((tpl) => (
            <TplCard key={tpl.id} tpl={tpl} onPreview={onPreview} onUse={onUse} onDelete={onDelete} />
          ))}
        </div>
      ) : (
        <div className="tpl-mine-empty">
          还没有自建模板。打开一篇结构不错的文档，点右上角「把当前文档存为模板」，就会出现在这里。
        </div>
      )}
    </div>
  );
}

/* ---------------- 知识广场 ---------------- */
export function KnowledgeSquare({ docs, onOpen, onToggleFav }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const list = kw
      ? docs.filter(
          (d) =>
            (d.title || "").toLowerCase().includes(kw) ||
            (d.excerpt || "").toLowerCase().includes(kw)
        )
      : docs;
    return [...list].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }, [docs, q]);

  return (
    <div className="view square">
      <div className="view-head row">
        <div>
          <h1>知识广场</h1>
          <p className="view-sub">
            {q
              ? `找到 ${filtered.length} 篇匹配「${q.trim()}」的文档`
              : `浏览你创建的所有文档（${docs.length} 篇）`}
          </p>
        </div>
        <input
          className="square-search"
          placeholder="搜索标题或正文…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {filtered.length ? (
        <div className="doc-grid">
          {filtered.map((d) => (
            <DocCard key={d.id} doc={d} onOpen={onOpen} onToggleFav={onToggleFav} />
          ))}
        </div>
      ) : (
        <div className="view-empty">{q ? "没有匹配标题的文档" : "还没有文档"}</div>
      )}
    </div>
  );
}

/* ---------------- 收藏空间 ---------------- */
export function FavoritesSpaceView({ favorites, onOpen, onToggleFav }) {
  if (!favorites.length) {
    return (
      <div className="view favspace">
        <div className="view-head">
          <h1>收藏空间</h1>
          <p className="view-sub">你收藏的文档会集中展示在这里</p>
        </div>
        <div className="view-empty">还没有收藏。打开任意文档，点顶部的 ☆ 即可加入收藏空间。</div>
      </div>
    );
  }
  return (
    <div className="view favspace">
      <div className="view-head">
        <h1>收藏空间</h1>
        <p className="view-sub">共 {favorites.length} 篇收藏</p>
      </div>
      <div className="doc-grid">
        {favorites.map((d) => (
          <DocCard key={d.id} doc={d} onOpen={onOpen} onToggleFav={onToggleFav} showUnfav />
        ))}
      </div>
    </div>
  );
}
