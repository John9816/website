/**
 * 扩展功能统一面板：通知 / 回收站 / 评论 / 权限审批 / 在线成员 / 统计
 * 从 xuecheng-editor 全功能版移植到 Node 单进程部署的简化实现（文件存储 + 轮询）。
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

const TABS = [
  { key: 'notifications', label: '通知' },
  { key: 'trash', label: '回收站' },
  { key: 'comments', label: '评论' },
  { key: 'access', label: '审批' },
  { key: 'presence', label: '在线' },
  { key: 'stats', label: '统计' },
];

function time(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const d = Math.max(0, Date.now() - t);
  const m = Math.floor(d / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return new Date(t).toLocaleDateString('zh-CN');
}

export default function FeaturesPanel({ open, onClose, docId, onError, onRestored }) {
  const [tab, setTab] = useState('notifications');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({});
  const [text, setText] = useState('');

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      let d;
      switch (tab) {
        case 'notifications': d = (await api.notifications.list()).data || []; break;
        case 'trash': d = (await api.trash.list()).data || []; break;
        case 'comments': d = (await api.comments.list(docId)).data || []; break;
        case 'access': d = (await api.access.list()).data || []; break;
        case 'presence': d = (await api.presence.list()).data || {}; break;
        case 'stats': d = (await api.stats()).data || {}; break;
        default: d = [];
      }
      setData((prev) => ({ ...prev, [tab]: d }));
    } catch (e) {
      onError?.(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [open, tab, docId, onError]);

  useEffect(() => { load(); }, [load]);
  // 在线/通知用轮询模拟实时（每 8 秒）
  useEffect(() => {
    if (!open || (tab !== 'presence' && tab !== 'notifications')) return;
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [open, tab, load]);

  // 心跳
  useEffect(() => {
    if (!open) return;
    try { api.presence.heartbeat(docId || null); } catch {}
    const id = setInterval(() => { try { api.presence.heartbeat(docId || null); } catch {} }, 20000);
    return () => clearInterval(id);
  }, [open, docId]);

  const act = async (fn, msg) => {
    try {
      await fn();
      await load();
      if (msg) onRestored?.(msg);
    } catch (e) { onError?.(e?.message || '操作失败'); }
  };

  if (!open) return null;
  const cur = data[tab];

  return (
    <div className="fp-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fp-panel" role="dialog" aria-label="扩展功能">
        <div className="fp-head">
          <div className="fp-title">协作与工具</div>
          <button className="fp-close" aria-label="关闭" onClick={onClose}>×</button>
        </div>
        <div className="fp-tabs">
          {TABS.map((t) => (
            <button key={t.key} className={'fp-tab' + (tab === t.key ? ' active' : '')} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="fp-body">
          {loading && <div className="fp-empty">加载中…</div>}

          {!loading && tab === 'notifications' && (
            <div className="fp-list">
              {(!cur || !cur.length) && <div className="fp-empty">暂无通知</div>}
              {cur?.map((n) => (
                <div key={n.id} className={'fp-item' + (n.read ? '' : ' unread')}>
                  <div className="fp-item-title">[{n.type}] {n.text}</div>
                  <div className="fp-item-meta">{n.actor} · {time(n.createdAt)}</div>
                </div>
              ))}
              {cur?.some((n) => !n.read) && (
                <button className="fp-btn" onClick={() => act(() => api.notifications.readAll(), '已全部标为已读')}>全部标为已读</button>
              )}
            </div>
          )}

          {!loading && tab === 'trash' && (
            <div className="fp-list">
              {(!cur || !cur.length) && <div className="fp-empty">回收站为空</div>}
              {cur?.map((b) => (
                <div key={b.id} className="fp-item">
                  <div className="fp-item-title">{b.docs?.length || 0} 篇文档 · {time(b.at)}</div>
                  <div className="fp-item-meta">{b.docs?.map((d) => d.title).join('、')}</div>
                  <div className="fp-actions">
                    <button className="fp-btn" onClick={() => act(() => api.trash.restore(b.id), '已恢复')}>恢复</button>
                    <button className="fp-btn ghost" onClick={() => act(() => api.trash.purge(b.id), '已彻底删除')}>彻底删除</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && tab === 'comments' && (
            <div className="fp-list">
              <div className="fp-compose">
                <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="写下评论…" rows={2} />
                <button className="fp-btn" disabled={!text.trim()} onClick={() => act(async () => { await api.comments.create(docId, text); setText(''); })}>发表</button>
              </div>
              {(!cur || !cur.length) && <div className="fp-empty">当前文档暂无评论</div>}
              {cur?.map((c) => (
                <div key={c.id} className="fp-item">
                  <div className="fp-item-title">{c.author}：{c.text}</div>
                  <div className="fp-item-meta">{time(c.createdAt)}</div>
                  {(c.replies || []).map((r) => (
                    <div key={r.id} className="fp-reply">↳ {r.author}：{r.text}</div>
                  ))}
                  <div className="fp-actions">
                    <button className="fp-btn ghost" onClick={() => act(() => api.comments.remove(c.id), '已删除评论')}>删除</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && tab === 'access' && (
            <div className="fp-list">
              {(!cur || !cur.length) && <div className="fp-empty">暂无申请</div>}
              {cur?.map((r) => (
                <div key={r.id} className="fp-item">
                  <div className="fp-item-title">{r.applicant} 申请「{r.docTitle || r.docId}」（{r.role}）</div>
                  <div className="fp-item-meta">{r.message} · {time(r.createdAt)} · {r.status}</div>
                  {r.status === 'pending' && (
                    <div className="fp-actions">
                      <button className="fp-btn" onClick={() => act(() => api.access.decide(r.id, true), '已通过')}>通过</button>
                      <button className="fp-btn ghost" onClick={() => act(() => api.access.decide(r.id, false), '已拒绝')}>拒绝</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && tab === 'presence' && (
            <div className="fp-list">
              {(!cur || !Object.keys(cur).length) && <div className="fp-empty">暂无在线成员</div>}
              {cur && Object.entries(cur).map(([uid, v]) => (
                <div key={uid} className="fp-item">
                  <div className="fp-item-title"><span className="fp-online-dot" />{v.name}</div>
                  <div className="fp-item-meta">{v.docId ? '正在查看文档' : '在线'} · {time(new Date(v.at).toISOString())}</div>
                </div>
              ))}
            </div>
          )}

          {!loading && tab === 'stats' && cur && (
            <div className="fp-stats">
              <div className="fp-stat"><b>{cur.docs ?? '-'}</b><span>文档</span></div>
              <div className="fp-stat"><b>{cur.favorites ?? '-'}</b><span>收藏</span></div>
              <div className="fp-stat"><b>{cur.shared ?? '-'}</b><span>分享</span></div>
              <div className="fp-stat"><b>{cur.comments ?? '-'}</b><span>评论</span></div>
              <div className="fp-stat"><b>{cur.trashBatches ?? '-'}</b><span>回收站批次</span></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
