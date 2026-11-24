import { useEffect, useState } from 'react'
import { ArrowLeft, Plus, Trash2, Check, X, Database } from 'lucide-react'
import { message } from 'antd'
import { useNavigate } from 'react-router-dom'
import {
  deleteUserBookSource,
  importUserBookSource,
  listBookSources,
  listUserBookSources,
  setUserBookSourceEnabled,
  type BookSourceCatalog,
  type BookUserSource,
} from '../../api/reading'
import { clearMyOfflineCache, countMyOfflineChapters } from '../../utils/bookCache'
import AppShell from '../../components/AppShell'
import '../../styles/reading.css'

export default function BookSourcesPage() {
  const navigate = useNavigate()
  const [builtin, setBuiltin] = useState<BookSourceCatalog[]>([])
  const [userSources, setUserSources] = useState<BookUserSource[]>([])
  const [loading, setLoading] = useState(true)
  const [showImport, setShowImport] = useState(false)
  const [definition, setDefinition] = useState('')
  const [importing, setImporting] = useState(false)
  const [cachedCount, setCachedCount] = useState(0)

  useEffect(() => {
    countMyOfflineChapters().then(setCachedCount)
  }, [])

  const clearCache = async () => {
    const n = await clearMyOfflineCache()
    setCachedCount(0)
    message.success(`已清除 ${n} 章离线缓存`)
  }

  const load = () => {
    setLoading(true)
    Promise.all([listBookSources(), listUserBookSources()])
      .then(([b, u]) => {
        setBuiltin(b || [])
        setUserSources(u || [])
      })
      .catch((e) => message.error(e?.message || '加载书源失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const doImport = async () => {
    if (!definition.trim()) {
      message.warning('请粘贴书源规则')
      return
    }
    setImporting(true)
    try {
      await importUserBookSource(definition.trim())
      message.success('书源导入成功')
      setDefinition('')
      setShowImport(false)
      load()
    } catch (e) {
      message.error((e as Error)?.message || '导入失败，请检查书源规则格式')
    } finally {
      setImporting(false)
    }
  }

  const toggle = async (s: BookUserSource) => {
    try {
      await setUserBookSourceEnabled(s.id, !s.enabled)
      load()
    } catch (e) {
      message.error((e as Error)?.message || '操作失败')
    }
  }

  const remove = async (s: BookUserSource) => {
    try {
      await deleteUserBookSource(s.id)
      message.success('已删除书源')
      load()
    } catch (e) {
      message.error((e as Error)?.message || '删除失败')
    }
  }

  return (
    <AppShell>
      <div className="reading-page">
        <header className="reading-header">
          <div className="reading-header-top">
            <button type="button" className="reading-icon-btn" onClick={() => navigate(-1)} aria-label="返回">
              <ArrowLeft size={20} />
            </button>
            <span className="reading-page-title">书源管理</span>
            <button type="button" className="reading-refresh" onClick={() => setShowImport(true)}>
              <Plus size={16} /> 导入
            </button>
          </div>
        </header>

        <div className="reading-body">
          {loading && <div className="reading-loading">加载中…</div>}

          <section className="reading-source-section">
            <h3>内置书源</h3>
            {builtin.map((s) => (
              <div className="reading-source-card" key={s.id}>
                <div className="reading-source-card-main">
                  <strong>{s.name}</strong>
                  <span className={`reading-source-status ${s.operational ? 'ok' : 'off'}`}>
                    {s.operational ? '可用' : s.status || '未知'}
                  </span>
                </div>
                <p>{s.description}</p>
                {s.maintained && <small>官方维护</small>}
              </div>
            ))}
          </section>

          <section className="reading-source-section">
            <h3>我的书源（{userSources.length}）</h3>
            {userSources.map((s) => (
              <div className="reading-source-card" key={s.id}>
                <div className="reading-source-card-main">
                  <strong>{s.sourceName}</strong>
                  <div className="reading-source-actions">
                    <button
                      type="button"
                      className={`reading-toggle ${s.enabled ? 'on' : ''}`}
                      onClick={() => toggle(s)}
                      title={s.enabled ? '点击停用' : '点击启用'}
                    >
                      {s.enabled ? <Check size={14} /> : <X size={14} />}
                      {s.enabled ? '已启用' : '已停用'}
                    </button>
                    <button type="button" className="reading-delete" onClick={() => remove(s)} aria-label="删除">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <p>{s.sourceUrl}</p>
                {s.message && <small className={s.status === 'error' ? 'err' : ''}>{s.message}</small>}
              </div>
            ))}
            {userSources.length === 0 && !loading && (
              <div className="reading-empty small">还没有自定义书源，点右上角「导入」添加。</div>
            )}
          </section>

          <section className="reading-source-section">
            <h3>离线缓存</h3>
            <div className="reading-source-card">
              <div className="reading-source-card-main">
                <strong><Database size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />已缓存 {cachedCount} 章</strong>
                <button
                  type="button"
                  className="reading-delete"
                  onClick={clearCache}
                  disabled={cachedCount === 0}
                  title="清除本机所有离线章节"
                >
                  <Trash2 size={15} /> 清除缓存
                </button>
              </div>
              <p>在章节阅读页的「阅读设置 → 离线缓存」可缓存后续章节，无网络时也能阅读。</p>
            </div>
          </section>
        </div>

        {showImport && (
          <div className="reading-modal-mask" onClick={() => setShowImport(false)}>
            <div className="reading-modal" onClick={(e) => e.stopPropagation()}>
              <div className="reading-modal-head">
                <strong>导入书源</strong>
                <button type="button" className="reading-icon-btn" onClick={() => setShowImport(false)} aria-label="关闭">
                  <X size={18} />
                </button>
              </div>
              <p className="reading-modal-hint">粘贴书源规则 JSON（支持单个书源或书源列表）。导入后需启用才会生效。</p>
              <textarea
                value={definition}
                onChange={(e) => setDefinition(e.target.value)}
                placeholder='{"bookSourceName":"…","bookSourceUrl":"…","searchUrl":"…",…}'
                rows={10}
              />
              <div className="reading-modal-actions">
                <button type="button" className="book-secondary-btn" onClick={() => setShowImport(false)}>取消</button>
                <button type="button" className="book-primary-btn" onClick={doImport} disabled={importing}>
                  {importing ? '导入中…' : '确认导入'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
