/**
 * 问卷块节点视图
 * - 定义（标题 + 多题型题目）内联在节点 attrs，编辑态由作者修改并写回文档
 * - 作答走后端：按 visitor 去重；作者（editable / detail）可见原始回答与聚合，访客见聚合
 */
import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { genId } from "./commands.js";

function commitDef(view, getPos, nextAttrs) {
  const pos = typeof getPos === "function" ? getPos() : getPos;
  if (typeof pos !== "number") return;
  view.dispatch(view.state.tr.setNodeMarkup(pos, null, { ...nextAttrs }));
}

function optionCount(responses, qid, optId, type) {
  let c = 0;
  for (const r of responses || []) {
    const a = r.answers && r.answers[qid];
    if (type === "multi") {
      if (Array.isArray(a) && a.includes(optId)) c++;
    } else if (a === optId) c++;
  }
  return c;
}

export default function SurveyView({ node, view, getPos, editable, docId, shareToken }) {
  const blockId = node.attrs.id;
  const [def, setDef] = useState({ title: node.attrs.title, questions: node.attrs.questions || [] });
  const [answers, setAnswers] = useState({});
  const [tally, setTally] = useState(null); // { submitted, total, responses? }
  const [busy, setBusy] = useState(false);
  const defRef = useRef(def);
  defRef.current = def;

  // 分享页用 token 接口；服务端强制 detail=false，匿名者拿不到原始回答
  const loadTally = () =>
    shareToken
      ? api.shareInteractions.get(shareToken)
      : api.interactions.get(docId, !!editable);
  const submitAnswers = (body) =>
    shareToken ? api.shareInteractions.submit(shareToken, body) : api.interactions.submit(docId, body);

  useEffect(() => {
    setDef({ title: node.attrs.title, questions: node.attrs.questions || [] });
  }, [node]);

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
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [docId, shareToken, blockId, editable]);

  const responses = (tally && tally.responses) || [];
  const submitted = !!(tally && tally.submitted);
  const total = (tally && tally.total) || 0;
  const showResults = editable || submitted;

  /* ---------- 编辑态：本地状态先更新，失焦/结构性操作时写回节点 ---------- */
  const updateDef = (next) => setDef(next);
  const commitNow = () => commitDef(view, getPos, { ...defRef.current, id: blockId });

  const setLocalQuestion = (i, patch) =>
    setDef((d) => ({ ...d, id: blockId, questions: d.questions.map((q, k) => (k === i ? { ...q, ...patch } : q)) }));
  const setLocalOptionText = (qi, oi, text) =>
    setDef((d) => ({
      ...d,
      id: blockId,
      questions: d.questions.map((q, k) =>
        k === qi ? { ...q, options: q.options.map((o, m) => (m === oi ? { ...o, text } : o)) } : q
      ),
    }));

  const addQuestion = () => {
    const next = {
      ...defRef.current,
      id: blockId,
      questions: [
        ...defRef.current.questions,
        { id: genId("q_"), type: "single", title: "新问题", options: [{ id: genId("o_"), text: "选项一" }, { id: genId("o_"), text: "选项二" }] },
      ],
    };
    setDef(next);
    commitDef(view, getPos, next);
  };
  const removeQuestion = (i) => {
    const next = { ...defRef.current, id: blockId, questions: defRef.current.questions.filter((_, k) => k !== i) };
    setDef(next);
    commitDef(view, getPos, next);
  };
  const addOption = (qi) => {
    const next = {
      ...defRef.current,
      id: blockId,
      questions: defRef.current.questions.map((q, k) =>
        k === qi ? { ...q, options: [...(q.options || []), { id: genId("o_"), text: "新选项" }] } : q
      ),
    };
    setDef(next);
    commitDef(view, getPos, next);
  };
  const removeOption = (qi, oi) => {
    const next = {
      ...defRef.current,
      id: blockId,
      questions: defRef.current.questions.map((q, k) =>
        k === qi ? { ...q, options: (q.options || []).filter((_, m) => m !== oi) } : q
      ),
    };
    setDef(next);
    commitDef(view, getPos, next);
  };

  /* ---------- 填写态：作答 ---------- */
  const setAnswer = (qid, val) => setAnswers((a) => ({ ...a, [qid]: val }));
  const allAnswered = def.questions.every((q) => {
    const a = answers[q.id];
    if (q.type === "multi") return Array.isArray(a) && a.length > 0;
    return a != null && a !== "";
  });

  const onSubmit = async () => {
    if ((!docId && !shareToken) || busy || submitted) return;
    setBusy(true);
    try {
      const t = await submitAnswers({ blockId, type: "survey", action: "submit", answers });
      setTally(t);
    } catch (e) {
      console.error(e);
    }
    setBusy(false);
  };

  return (
    <div className="survey-block" data-survey-id={blockId}>
      <div className="survey-head">
        {editable ? (
          <input
            className="survey-title-input"
            value={def.title}
            placeholder="问卷标题"
            onChange={(e) => updateDef({ ...defRef.current, id: blockId, title: e.target.value })}
            onBlur={commitNow}
          />
        ) : (
          <div className="survey-title">{def.title || "问卷调查"}</div>
        )}
        {editable && <span className="survey-tag">问卷</span>}
      </div>

      <div className="survey-qs">
        {def.questions.map((q, qi) => {
          const isChoice = q.type === "single" || q.type === "multi";
          return (
            <div className="survey-q" key={q.id}>
              <div className="survey-q-title">
                {editable ? (
                  <input
                    className="survey-q-input"
                    value={q.title}
                    placeholder="题目"
                    onChange={(e) => setLocalQuestion(qi, { title: e.target.value })}
                    onBlur={commitNow}
                  />
                ) : (
                  <span>
                    {qi + 1}. {q.title || "（未命名题目）"}
                    <em className="survey-q-type">
                      {q.type === "single" ? "单选" : q.type === "multi" ? "多选" : "填空"}
                    </em>
                  </span>
                )}
                {editable && (
                  <span className="survey-q-tools">
                    <select
                      className="rnv-interactive"
                      value={q.type}
                      onChange={(e) => setLocalQuestion(qi, { type: e.target.value })}
                      onBlur={commitNow}
                    >
                      <option value="single">单选</option>
                      <option value="multi">多选</option>
                      <option value="text">填空</option>
                    </select>
                    <button className="survey-q-del" onClick={() => removeQuestion(qi)}>
                      ×
                    </button>
                  </span>
                )}
              </div>

              {/* 选项编辑 */}
              {editable && isChoice && (
                <div className="survey-opts-edit">
                  {(q.options || []).map((o, oi) => (
                    <div className="survey-opt-edit" key={o.id}>
                      <input
                        className="survey-opt-input"
                        value={o.text}
                        onChange={(e) => setLocalOptionText(qi, oi, e.target.value)}
                        onBlur={commitNow}
                      />
                      <button className="survey-opt-del" onClick={() => removeOption(qi, oi)}>
                        ×
                      </button>
                    </div>
                  ))}
                  <button className="survey-opt-add" onClick={() => addOption(qi)}>
                    ＋ 选项
                  </button>
                </div>
              )}

              {/* 填写 */}
              {!editable && !showResults && (
                <div className="survey-q-fill">
                  {q.type === "single" &&
                    (q.options || []).map((o) => (
                      <label className="survey-opt" key={o.id}>
                        <input
                          type="radio"
                          className="rnv-interactive"
                          name={q.id}
                          checked={answers[q.id] === o.id}
                          onChange={() => setAnswer(q.id, o.id)}
                        />
                        {o.text}
                      </label>
                    ))}
                  {q.type === "multi" &&
                    (q.options || []).map((o) => (
                      <label className="survey-opt" key={o.id}>
                        <input
                          type="checkbox"
                          className="rnv-interactive"
                          checked={Array.isArray(answers[q.id]) && answers[q.id].includes(o.id)}
                          onChange={(e) =>
                            setAnswer(
                              q.id,
                              e.target.checked
                                ? [...(answers[q.id] || []), o.id]
                                : (answers[q.id] || []).filter((x) => x !== o.id)
                            )
                          }
                        />
                        {o.text}
                      </label>
                    ))}
                  {q.type === "text" && (
                    <textarea
                      className="survey-text rnv-interactive"
                      value={answers[q.id] || ""}
                      placeholder="在此填写"
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                    />
                  )}
                </div>
              )}

              {/* 结果（作者可见聚合+原始；访客提交后见聚合） */}
              {showResults && isChoice && (
                <div className="survey-results">
                  {(q.options || []).map((o) => {
                    const c = optionCount(responses, q.id, o.id, q.type);
                    const pct = total ? Math.round((c / total) * 100) : 0;
                    return (
                      <div className="survey-res" key={o.id}>
                        <span className="survey-res-label">{o.text}</span>
                        <span className="survey-bar-wrap">
                          <span className="survey-bar" style={{ width: pct + "%" }} />
                          <span className="survey-pct">{pct}%（{c}）</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {showResults && q.type === "text" && (
                <div className="survey-text-res">
                  {responses.length === 0 ? (
                    <span className="survey-text-empty">暂无填空回答</span>
                  ) : (
                    responses.map((r, i) => {
                      const txt = r.answers && r.answers[q.id];
                      if (!txt) return null;
                      return (
                        <div className="survey-text-item" key={r.id || i}>
                          {txt}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editable && (
        <div className="survey-foot">
          <button className="survey-add-q" onClick={addQuestion}>
            ＋ 添加题目
          </button>
        </div>
      )}

      {!editable && !submitted && (
        <div className="survey-submit-row">
          <button className="survey-submit" onClick={onSubmit} disabled={busy || !allAnswered}>
            {busy ? "提交中…" : !allAnswered ? "请完成所有题目" : "提交问卷"}
          </button>
        </div>
      )}
      {!editable && submitted && <div className="survey-meta">已提交 · 共 {total} 份回答</div>}
      {editable && total > 0 && <div className="survey-meta">已收 {total} 份回答</div>}
    </div>
  );
}
