/**
 * 投票块节点视图
 * - 定义（问题 + 选项）内联在节点 attrs，编辑态由作者修改并写回文档
 * - 计数走后端：按 visitor 去重，跨设备真多用户；本地轮询拿到实时结果
 */
import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { genId } from "./commands.js";

function commitDef(view, getPos, nextAttrs) {
  const pos = typeof getPos === "function" ? getPos() : getPos;
  if (typeof pos !== "number") return;
  const tr = view.state.tr.setNodeMarkup(pos, null, { ...nextAttrs });
  view.dispatch(tr);
}

export default function PollView({ node, view, getPos, editable, docId, shareToken }) {
  const blockId = node.attrs.id;
  const [def, setDef] = useState({ question: node.attrs.question, options: node.attrs.options || [] });
  const [tally, setTally] = useState(null); // { counts, total, myVote }
  const [busy, setBusy] = useState(false);
  const defRef = useRef(def);
  defRef.current = def;

  // 编辑页走 /api/docs/:id/...，公开分享页走 /api/share/:token/...
  // 两个接口返回结构一致，服务端保证分享页不回传内部 docId、也不回原始回答
  const loadTally = () =>
    shareToken ? api.shareInteractions.get(shareToken) : api.interactions.get(docId, false);
  const submitVote = (body) =>
    shareToken ? api.shareInteractions.submit(shareToken, body) : api.interactions.submit(docId, body);

  // 拉取/轮询后端计数（实时结果）
  useEffect(() => {
    if (!docId && !shareToken) return;
    let alive = true;
    const load = async () => {
      try {
        const data = await loadTally();
        if (alive && data && data[blockId]) setTally(data[blockId]);
      } catch (_) {}
    };
    load();
    const t = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [docId, shareToken, blockId]);

  // 节点变更时同步（远程/自身提交后）编辑态定义
  useEffect(() => {
    setDef({ question: node.attrs.question, options: node.attrs.options || [] });
  }, [node]);

  const counts = (tally && tally.counts) || {};
  const total = (tally && tally.total) || 0;
  const myVote = tally && tally.myVote;

  const onVote = async (optId) => {
    if (editable) return; // 编辑态不投票
    if ((!docId && !shareToken) || busy) return;
    setBusy(true);
    try {
      const t = await submitVote({
        blockId,
        type: "poll",
        action: "vote",
        vote: optId,
      });
      setTally(t);
    } catch (_) {}
    setBusy(false);
  };

  const setQuestion = (q) => setDef((d) => ({ ...d, question: q }));
  const commitQuestion = () =>
    commitDef(view, getPos, { ...defRef.current, id: blockId });
  const setOptionText = (i, text) =>
    setDef((d) => ({ ...d, options: d.options.map((o, k) => (k === i ? { ...o, text } : o)) }));
  const commitOptions = () =>
    commitDef(view, getPos, { ...defRef.current, id: blockId });
  const addOption = () => {
    const next = { ...defRef.current, id: blockId, options: [...defRef.current.options, { id: genId("o_"), text: "新选项" }] };
    setDef(next);
    commitDef(view, getPos, next);
  };
  const removeOption = (i) => {
    const next = { ...defRef.current, id: blockId, options: defRef.current.options.filter((_, k) => k !== i) };
    setDef(next);
    commitDef(view, getPos, next);
  };

  return (
    <div className="poll-block" data-poll-id={blockId}>
      <div className="poll-head">
        {editable ? (
          <input
            className="poll-q-input"
            value={def.question}
            placeholder="投票问题"
            onChange={(e) => setQuestion(e.target.value)}
            onBlur={commitQuestion}
          />
        ) : (
          <div className="poll-q">{def.question || "投票问题"}</div>
        )}
        {editable && <span className="poll-tag">投票</span>}
      </div>

      <div className="poll-opts">
        {(def.options || []).map((opt, i) => {
          const count = counts[opt.id] || 0;
          const pct = total ? Math.round((count / total) * 100) : 0;
          const mine = myVote === opt.id;
          return (
            <div key={opt.id} className={"poll-opt" + (mine ? " mine" : "")}>
              {editable ? (
                <div className="poll-opt-edit">
                  <input
                    className="poll-opt-input"
                    value={opt.text}
                    placeholder="选项内容"
                    onChange={(e) => setOptionText(i, e.target.value)}
                    onBlur={commitOptions}
                  />
                  <button className="poll-opt-del" title="删除选项" onClick={() => removeOption(i)}>
                    ×
                  </button>
                </div>
              ) : (
                <button
                  className={"poll-opt-btn rnv-interactive" + (total ? " voted" : "")}
                  onClick={() => onVote(opt.id)}
                  disabled={busy}
                >
                  <span className="poll-opt-label">{opt.text || "（空选项）"}</span>
                  {total > 0 && (
                    <span className="poll-bar-wrap">
                      <span className="poll-bar" style={{ width: pct + "%" }} />
                      <span className="poll-pct">{pct}%</span>
                    </span>
                  )}
                  {mine && <span className="poll-check">✓</span>}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {editable && (
        <div className="poll-foot">
          <button className="poll-add" onClick={addOption}>
            ＋ 添加选项
          </button>
        </div>
      )}

      {!editable && total > 0 && (
        <div className="poll-meta">共 {total} 票{myVote ? " · 你已投票（可改投）" : ""}</div>
      )}
    </div>
  );
}
