/**
 * AI 助手面板
 * ------------------------------------------------------------------
 * 三个标签页：
 *   技能  —— 对选中文本 / 整篇文档执行确定性操作（清洗、统计、导出）
 *   MCP   —— 管理 MCP 服务、浏览工具、填参数调用
 *   说明  —— 内置使用手册
 *
 * 面板不直接持有 ProseMirror view，全部操作通过 viewApi 走，
 * 这样面板与编辑器解耦，也便于以后换成别的编辑器内核。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, filterSkills } from "./skills.js";
import { api } from "./api.js";

/* ------------------------------------------------------------------ */
/* 图标                                                                */
/* ------------------------------------------------------------------ */
const ICONS = {
  lines: <path d="M4 6h12M4 10h12M4 14h8" />,
  trim: (
    <>
      <path d="M4 5v10M16 5v10" />
      <path d="M7.5 10h5" />
    </>
  ),
  space: (
    <>
      <path d="M3.5 7v6M16.5 7v6" />
      <path d="M6.5 10h7" />
    </>
  ),
  punct: (
    <>
      <path d="M6 13c0 1.4-1 2.4-2.4 2.6" />
      <circle cx="14" cy="7" r="1.1" />
    </>
  ),
  quote: (
    <>
      <path d="M4.6 12.4c0-2.6 1.4-4.2 3.6-4.6M12.2 12.4c0-2.6 1.4-4.2 3.6-4.6" />
      <path d="M4.6 12.4h2.8M12.2 12.4H15" />
    </>
  ),
  tight: <path d="M4 6h12M4 10h12M4 14h12" />,
  toc: (
    <>
      <path d="M4 5h4M4 10h4M4 15h4" />
      <path d="M10 5h6M10 10h6M10 15h6" />
    </>
  ),
  dedupe: (
    <>
      <rect x="3.6" y="3.6" width="8" height="8" rx="1.2" />
      <rect x="8.4" y="8.4" width="8" height="8" rx="1.2" />
    </>
  ),
  sort: (
    <>
      <path d="M6 4v12M6 16l-2-2M6 16l2-2" />
      <path d="M11 6h5M11 10h4M11 14h3" />
    </>
  ),
  number: (
    <>
      <path d="M3.4 6h2v4M3.4 10h2.6" />
      <path d="M10 6h6.6M10 10h6.6M10 14h6.6" />
    </>
  ),
  merge: (
    <>
      <path d="M4 5h4.5c1.4 0 2.1 1 3 2.4M4 15h4.5c1.4 0 2.1-1 3-2.4" />
      <path d="M10.6 10h5M13.4 7.6 15.8 10l-2.4 2.4" />
    </>
  ),
  chart: (
    <>
      <path d="M4 16V9M8.7 16V5.6M13.4 16v-4.6M17 16V7.4" />
    </>
  ),
  freq: (
    <>
      <path d="M4 14.5 7 8l3 6.5L13 6.5l3 8" />
      <path d="M3.5 16.6h13" />
    </>
  ),
  outline: (
    <>
      <path d="M4 5h5M7 10h5M10 15h5" />
    </>
  ),
  ruler: (
    <>
      <rect x="3.2" y="8" width="13.6" height="4.4" rx="1" />
      <path d="M6.4 8v2M9.4 8v2.8M12.4 8v2" />
    </>
  ),
  markdown: (
    <>
      <rect x="3.2" y="6" width="13.6" height="8" rx="1.4" />
      <path d="M5.8 11.8V8.4l1.9 2.2 1.9-2.2v3.4" />
      <path d="M12.6 8.4v3.4M11.2 10.6l1.4 1.4 1.4-1.4" />
    </>
  ),
  text: <path d="M4 5.4h12M4 9.4h12M4 13.4h7.5" />,
  table: (
    <>
      <rect x="3.4" y="4.4" width="13.2" height="11.2" rx="1.2" />
      <path d="M3.4 8h13.2M3.4 12h13.2M8.6 8v7.6M13 4.4v11.2" />
    </>
  ),
  json: (
    <>
      <path d="M8 3.8c-2 0-2 2.2-2 3.2S5.4 10 4 10c1.4 0 2 1 2 3s0 3.2 2 3.2" />
      <path d="M12 3.8c2 0 2 2.2 2 3.2s.6 3 2 3c-1.4 0-2 1-2 3s0 3.2-2 3.2" />
    </>
  ),
  search: (
    <>
      <circle cx="9" cy="9" r="4.6" />
      <path d="M12.6 12.6 16 16" />
    </>
  ),
  plus: <path d="M10 4.4v11.2M4.4 10h11.2" />,
  plug: (
    <>
      <path d="M7 3.6v4M13 3.6v4" />
      <path d="M5.2 7.6h9.6v2.2a4.8 4.8 0 0 1-9.6 0z" />
      <path d="M10 14.6v2.2" />
    </>
  ),
  trash: (
    <>
      <path d="M4.6 6.2h10.8" />
      <path d="M6.5 6.2 7 16h6l.5-9.8" />
      <path d="M8 6.2V4.4h4v1.8" />
    </>
  ),
  play: <path d="M7 4.6 15 10l-8 5.4z" />,
  copy: (
    <>
      <rect x="7" y="7" width="8.4" height="8.4" rx="1.2" />
      <path d="M12.4 7V5.2a1.2 1.2 0 0 0-1.2-1.2H5.2A1.2 1.2 0 0 0 4 5.2v6a1.2 1.2 0 0 0 1.2 1.2H7" />
    </>
  ),
  download: (
    <>
      <path d="M10 3.8v8.4M7 9.6l3 3 3-3" />
      <path d="M4.6 15.4h10.8" />
    </>
  ),
  spark: (
    <>
      <path d="M10 3.2l1.5 4.3 4.3 1.5-4.3 1.5L10 14.8 8.5 10.5 4.2 9l4.3-1.5z" />
      <path d="M15.4 13.4l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" />
    </>
  ),
};

function Ico({ name, size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name] || ICONS.spark}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */
function copyText(text) {
  try {
    navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}

function download(text, filename, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function preview(text, max = 4000) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + `\n\n…（已截断，共 ${text.length} 字符，复制/下载可得全文）` : text;
}

/* ------------------------------------------------------------------ */
/* 技能页                                                              */
/* ------------------------------------------------------------------ */
function SkillsTab({ viewApi, docTitle }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);
  const [ctxInfo, setCtxInfo] = useState({ hasSelection: false, chars: 0 });
  const [hint, setHint] = useState("");

  const list = useMemo(() => filterSkills(q, cat), [q, cat]);

  // 面板可见时轮询一次上下文（选区可能随时变化）
  useEffect(() => {
    const tick = () => {
      const ctx = viewApi?.getContext?.();
      setCtxInfo({ hasSelection: !!ctx?.hasSelection, chars: (ctx?.text || "").length });
    };
    tick();
    const id = setInterval(tick, 300);
    return () => clearInterval(id);
  }, [viewApi]);

  const run = useCallback(
    (skill) => {
      setBusy(skill.id);
      setHint("");
      // 让 loading 先渲染出来，再跑同步计算
      requestAnimationFrame(() => {
        try {
          const ctx = viewApi?.getContext?.() || {};
          if (skill.scope === "selection" && !ctx.hasSelection) {
            throw new Error("请先在正文中选中一段文本，再点这个技能");
          }
          const out = skill.run(ctx);
          setResult({ skill, ...out, crossBlock: !!ctx.crossBlock, at: Date.now() });
        } catch (e) {
          setResult({ skill, error: e.message || "执行失败" });
        } finally {
          setBusy("");
        }
      });
    },
    [viewApi]
  );

  const apply = (where) => {
    if (!result || result.error) return;
    if (result.crossBlock && result.skill.scope === "selection") {
      setHint("选区跨了多个段落，替换会合并为一个段落——已改为插入，原内容保留");
      viewApi?.insertText?.(result.text);
    } else if (where === "replace") {
      viewApi?.replaceSelection?.(result.text);
    } else {
      viewApi?.insertText?.(result.text);
    }
  };

  return (
    <div className="ai-skills">
      <div className="ai-search">
        <Ico name="search" size={14} />
        <input
          placeholder="搜索技能，如「空格」「目录」「Markdown」"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="ai-cats">
        <button className={cat === "all" ? "on" : ""} onClick={() => setCat("all")}>
          全部
        </button>
        {CATEGORIES.map((c) => (
          <button key={c.key} className={cat === c.key ? "on" : ""} onClick={() => setCat(c.key)}>
            {c.name}
          </button>
        ))}
      </div>

      <div className={"ai-ctx" + (ctxInfo.hasSelection ? " has" : "")}>
        {ctxInfo.hasSelection ? `已选中 ${ctxInfo.chars} 个字符` : "未选中文本 · 清洗类技能需要先划选一段"}
      </div>

      <div className="ai-list">
        {list.map((s) => {
          const needSel = s.scope === "selection";
          const disabled = needSel && !ctxInfo.hasSelection;
          return (
            <button
              key={s.id}
              className={"ai-skill" + (busy === s.id ? " busy" : "") + (disabled ? " dim" : "")}
              onClick={() => run(s)}
              disabled={busy === s.id}
            >
              <span className="ai-skill-ico">
                <Ico name={s.icon} size={15} />
              </span>
              <span className="ai-skill-text">
                <b>{s.name}</b>
                <em>{s.desc}</em>
              </span>
              <span className="ai-scope">{s.mode === "download" ? "导出" : s.mode === "info" ? "只读" : needSel ? "选区" : "全文"}</span>
            </button>
          );
        })}
        {!list.length && <div className="ai-empty">没有匹配的技能</div>}
      </div>

      {result && (
        <div className={"ai-result" + (result.error ? " err" : "")}>
          <div className="ai-result-head">
            <b>{result.skill.name}</b>
            {result.note && <span>{result.note}</span>}
            <button className="ai-x" onClick={() => setResult(null)} title="关闭结果">
              ×
            </button>
          </div>

          {result.error ? (
            <p className="ai-err-text">{result.error}</p>
          ) : (
            <>
              <pre className="ai-pre">{preview(result.text)}</pre>
              <div className="ai-actions">
                {result.skill.mode === "replace" && (
                  <>
                    <button className="ai-btn primary" onClick={() => apply("replace")}>
                      替换选中
                    </button>
                    <button className="ai-btn" onClick={() => apply("insert")}>
                      插入到光标
                    </button>
                  </>
                )}
                {result.skill.mode === "insert" && (
                  <button className="ai-btn primary" onClick={() => apply("insert")}>
                    插入到光标
                  </button>
                )}
                {result.skill.mode === "download" && (
                  <button
                    className="ai-btn primary"
                    onClick={() =>
                      download(
                        result.text,
                        `${(docTitle || "文档").replace(/[\\/:*?"<>|]/g, "_")}.${result.ext || "txt"}`,
                        result.mime
                      )
                    }
                  >
                    <Ico name="download" size={13} /> 下载 .{result.ext || "txt"}
                  </button>
                )}
                <button
                  className="ai-btn"
                  onClick={() => {
                    const ok = copyText(result.text);
                    setHint(ok ? "已复制到剪贴板" : "复制失败，请手动全选复制");
                  }}
                >
                  <Ico name="copy" size={13} /> 复制
                </button>
              </div>
            </>
          )}
          {hint && <p className="ai-hint">{hint}</p>}
        </div>
      )}
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* 说明页                                                              */
/* ------------------------------------------------------------------ */
function HelpTab() {
  return (
    <div className="ai-help">
      <h3>AI 助手能做什么</h3>
      <p>
        面板里有两类能力：<b>技能</b>（本地、确定性、不需要联网）和 <b>MCP</b>（连接外部工具服务）。
        当前版本没有接入大模型，因此不会「凭空生成」内容——所有结果都来自你的文字本身或你配置的 MCP 服务。
      </p>

      <h3>技能怎么用</h3>
      <ol>
        <li>在正文里<b>划选一段文字</b>（清洗类技能需要选区）</li>
        <li>在「技能」页搜索或按分类找到它，点一下</li>
        <li>看结果预览，选择<b>替换选中</b> / <b>插入光标</b> / <b>复制</b> / <b>下载</b></li>
      </ol>
      <p className="ai-note">
        清洗类技能只作用于选区：如果选区跨了多个段落，替换会把它们合并成一段，此时面板会自动改为「插入」以避免破坏结构。
      </p>

      <h3>常用技能</h3>
      <table className="ai-table">
        <thead>
          <tr><th>技能</th><th>作用</th></tr>
        </thead>
        <tbody>
          <tr><td>中英文加空格</td><td>「使用Redis缓存」→「使用 Redis 缓存」</td></tr>
          <tr><td>标点规范化</td><td>中文句子里的半角 , . ; 转全角，自动跳过 URL 与小数</td></tr>
          <tr><td>整理空行</td><td>连续空行压成一行，去除行尾空格</td></tr>
          <tr><td>合并为一段</td><td>修复从 PDF 复制来的「一行一段」</td></tr>
          <tr><td>生成目录</td><td>按标题层级生成缩进目录，插入光标处</td></tr>
          <tr><td>文档统计</td><td>字数、段落、标题、表格、阅读时长</td></tr>
          <tr><td>长句检查</td><td>找出超过 60 字未断句的句子</td></tr>
          <tr><td>导出 Markdown</td><td>保留标题、列表、表格、代码块、提示块</td></tr>
        </tbody>
      </table>

      <h3>MCP 是什么</h3>
      <p>
        MCP（Model Context Protocol）是连接「编辑器」和「外部工具」的通用协议。
        配置一个 MCP 服务后，它会把自己的工具清单暴露给编辑器，你可以填参数直接调用，
        结果能一键插入到文档里。
      </p>

      <h3>两种传输方式</h3>
      <table className="ai-table">
        <thead>
          <tr><th>方式</th><th>适用</th><th>填什么</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>stdio</td>
            <td>本机安装的命令行服务</td>
            <td>命令 + 参数，例如 <code>npx</code> / <code>-y @modelcontextprotocol/server-filesystem /tmp</code></td>
          </tr>
          <tr>
            <td>HTTP</td>
            <td>别人部署好的远程服务</td>
            <td>URL，必要时加 Authorization 头</td>
          </tr>
        </tbody>
      </table>

      <h3>现成例子：本地文件服务</h3>
      <pre className="ai-pre">{`名称      本地文件
传输方式  stdio
命令      npx
参数      -y @modelcontextprotocol/server-filesystem /tmp`}</pre>
      <p>保存并连接后展开服务，就能看到 read_file、list_directory 等 14 个工具。</p>

      <h3>现成例子：随项目附带的示例服务</h3>
      <pre className="ai-pre">{`名称      echo-demo
命令      node
参数      /opt/xuecheng-editor/docs/examples/mcp-echo-server.mjs`}</pre>
      <p>这个示例自带 echo / sum / word_count 三个工具，适合先验证链路是否通。</p>

      <h3>安全提醒</h3>
      <ul>
        <li>stdio 会在服务器上<b>真实执行命令</b>，只添加你信任的服务。</li>
        <li>服务端默认有命令白名单（npx / node / python3 / uvx / deno / bun / docker），可通过环境变量 <code>MCP_STDIO_ALLOWLIST</code> 调整。</li>
        <li>不要把本服务直接暴露在公网；如需远程访问，请放在带鉴权的反向代理之后。</li>
      </ul>

      <h3>快捷键</h3>
      <table className="ai-table">
        <tbody>
          <tr><td><kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>J</kbd></td><td>打开 / 关闭 AI 面板</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>关闭面板</td></tr>
        </tbody>
      </table>

      <p className="ai-note">
        完整文档见项目内 <code>docs/skills-and-mcp.md</code>，包含自定义技能开发、MCP 协议细节与 API 参考。
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 面板外壳                                                            */
/* ------------------------------------------------------------------ */
export default function AiPanel({ canUseMcp: _canUseMcp = false, open, onClose, viewApi, docTitle, tab: tabProp, onTabChange }) {
  const [tab, setTab] = useState(tabProp === "mcp" ? "skills" : (tabProp || "skills"));
  useEffect(() => {
    if (tabProp) setTab(tabProp === "mcp" ? "skills" : tabProp);
  }, [tabProp]);

  const change = (t) => {
    setTab(t);
    onTabChange?.(t);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <aside className="ai-panel" aria-label="AI 助手">
      <div className="ai-head">
        <div className="ai-brand">
          <span className="ai-mark">
            <Ico name="spark" size={15} />
          </span>
          <b>AI 助手</b>
        </div>
        <div className="ai-tabs">
          <button className={tab === "skills" ? "on" : ""} onClick={() => change("skills")}>
            技能
          </button>
          <button className={tab === "help" ? "on" : ""} onClick={() => change("help")}>
            说明
          </button>
        </div>
        <button className="ai-x" onClick={onClose} title="关闭（Esc）">
          ×
        </button>
      </div>

      <div className="ai-body">
        <div className={"ai-pane" + (tab === "skills" ? " on" : "")}>
          <SkillsTab viewApi={viewApi} docTitle={docTitle} />
        </div>
        <div className={"ai-pane" + (tab === "help" ? " on" : "")}>
          <HelpTab />
        </div>
      </div>
    </aside>
  );
}
