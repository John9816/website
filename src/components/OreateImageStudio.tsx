import { useEffect, useMemo, useState } from 'react'
import { App as AntApp, Button, Form, Input, Select, Space, Tag, Upload } from 'antd'
import type { UploadFile } from 'antd'
import { Clock3, ImagePlus, LoaderCircle, RefreshCw, Share2, Sparkles, Trash2, UploadCloud, Video, Wand2 } from 'lucide-react'
import { adminDeleteImageHistory, adminListImageHistory, adminToggleImageHistoryShare } from '../api/admin'
import { generateOreateMedia, getOreateModelConfig, type OreateModelConfig, type OreateModelItem } from '../api/oreate'
import bundledModelConfig from '../data/oreate-model-config.json'
import { buildImageProxyUrl, normalizeRemoteImageUrl } from '../utils/remoteImage'
import type { GeneratedImageView } from '../types'
import ImagePreviewOverlay from './ImagePreviewOverlay'
import '../styles/oreate-image.css'

const FALLBACK = bundledModelConfig as unknown as OreateModelConfig
const RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4']

function unique<T>(items: T[]) { return Array.from(new Set(items.filter(Boolean))) }
function descText(desc: OreateModelItem['modelDesc']) {
  if (!desc) return 'AI model'
  if (typeof desc === 'string') return desc
  return desc.zh || desc.en || Object.values(desc)[0] || 'AI model'
}
function modelCost(model?: OreateModelItem, resolution?: string, duration?: string | number) {
  const costs = (model?.pointCostImage?.length ? model.pointCostImage : model?.pointCost) ?? []
  if (!costs.length) return null
  const exact = costs.find(c => (!resolution || !c.resolution || String(c.resolution) === String(resolution)) && (!duration || !c.duration || Number(c.duration) === Number(duration)))
  return Number((exact ?? costs[0]).point ?? 0) || null
}
function firstHistoryMedia(item: GeneratedImageView) { return item.imageUrl || '' }
function displayImage(url: string) { return normalizeRemoteImageUrl(url, { requireUsableAssetPath: true }) || url }
function isLikelyImageUrl(value?: string) { return !!value && /^https?:\/\//i.test(value.trim()) }
function formatHistoryTime(value?: string) {
  if (!value) return ''
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

type GenerationPhase = 'idle' | 'submitted' | 'connected' | 'rendering' | 'receiving' | 'completed' | 'failed'

const PHASE_STEPS: Array<{ key: GenerationPhase; label: string; percent: number }> = [
  { key: 'submitted', label: '????', percent: 12 },
  { key: 'connected', label: '????', percent: 28 },
  { key: 'rendering', label: '???', percent: 62 },
  { key: 'receiving', label: '????', percent: 86 },
  { key: 'completed', label: '??', percent: 100 },
]

function phasePercent(phase: GenerationPhase) {
  if (phase === 'failed') return 100
  return PHASE_STEPS.find(item => item.key === phase)?.percent ?? 0
}

function phaseLabel(phase: GenerationPhase) {
  if (phase === 'idle') return '????'
  if (phase === 'failed') return '????'
  return PHASE_STEPS.find(item => item.key === phase)?.label ?? '???'
}

function formatElapsed(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  const mm = String(Math.floor(safe / 60)).padStart(2, '0')
  const ss = String(safe % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

function generationEventName(event: unknown) {
  if (!event || typeof event !== 'object') return 'message'
  const record = event as Record<string, unknown>
  return String(record.event || record.type || 'message')
}

function eventToPhase(event: unknown): GenerationPhase | null {
  const name = generationEventName(event).toLowerCase()
  if (name === 'start') return 'connected'
  if (name === 'ping') return 'rendering'
  if (name === 'generating' || name === 'result' || name === 'success' || name === 'complete') return 'receiving'
  if (name === 'end') return 'completed'
  if (name === 'error' || name === 'failed') return 'failed'
  return null
}

function imageCandidates(url: string) {
  const candidates = [displayImage(url)]
  if (/^https?:\/\//i.test(url)) {
    candidates.push(url)
    candidates.push(buildImageProxyUrl(url))
  }
  return Array.from(new Set(candidates.filter(Boolean)))
}

function GeneratedMediaImage({ url, alt, onOpen }: { url: string; alt: string; onOpen: () => void }) {
  const candidates = useMemo(() => imageCandidates(url), [url])
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setIndex(0)
    setFailed(false)
  }, [url])

  const src = candidates[index] || url
  const handleError = () => {
    if (index < candidates.length - 1) {
      setIndex(current => current + 1)
      return
    }
    setFailed(true)
  }

  return <button type="button" className={`oreate-output-media${failed ? ' is-failed' : ''}`} onClick={onOpen}>
    {failed ? <span className="oreate-media-fallback"><strong>??????</strong><small>??????</small></span> : <img src={src} alt={alt} loading="lazy" onError={handleError} />}
  </button>
}

export default function OreateImageStudio() {
  const { message } = AntApp.useApp()
  const [form] = Form.useForm()
  const [config, setConfig] = useState<OreateModelConfig>(FALLBACK)
  const [configError, setConfigError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [videoUrls, setVideoUrls] = useState<string[]>([])
  const [preview, setPreview] = useState<string | null>(null)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [history, setHistory] = useState<GeneratedImageView[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [generationPhase, setGenerationPhase] = useState<GenerationPhase>('idle')
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [lastEventName, setLastEventName] = useState('idle')
  const [eventCount, setEventCount] = useState(0)

  const type = Form.useWatch('type', form) || 'image'
  const modelName = Form.useWatch('model', form)
  const resolution = Form.useWatch('resolution', form)
  const ratio = Form.useWatch('ratio', form)
  const duration = Form.useWatch('duration', form)
  const inputImageUrl = Form.useWatch('inputImage', form)
  const models = type === 'video' ? config.video : config.image
  const selectedModel = models.find(m => m.modelName === modelName) ?? models[0]
  const ratios = unique([...(selectedModel?.size ?? []), ...RATIOS]).slice(0, 10)
  const resolutions = unique((selectedModel?.resolution ?? []).map(String)).length ? unique((selectedModel?.resolution ?? []).map(String)) : (type === 'video' ? ['720', '1080'] : ['1K', '2K'])
  const durations = unique((selectedModel?.duration ?? [5, 8, 10]).map(String))
  const cost = modelCost(selectedModel, resolution, duration)
  const latestMediaCount = imageUrls.length + videoUrls.length
  const referencePreview = uploadPreview || (isLikelyImageUrl(inputImageUrl) ? displayImage(String(inputImageUrl).trim()) : null)

  const loadHistory = async (silent = false) => {
    if (!silent) setHistoryLoading(true)
    try {
      const data = await adminListImageHistory(0, 30)
      setHistory(data.items.filter(item => !!item.imageUrl))
    } catch (e) {
      if (!silent) message.error((e as Error).message)
    } finally {
      if (!silent) setHistoryLoading(false)
    }
  }

  useEffect(() => {
    void loadHistory(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!generating || !generationStartedAt) return
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - generationStartedAt) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [generating, generationStartedAt])

  useEffect(() => {
    ;(async () => {
      try {
        const data = await getOreateModelConfig()
        if (data.image?.length || data.video?.length) {
          setConfig({ image: data.image?.length ? data.image : FALLBACK.image, video: data.video?.length ? data.video : FALLBACK.video })
          setConfigError(null)
        }
      } catch {
        setConfigError('Model config is using local fallback')
      }
    })()
  }, [])

  useEffect(() => {
    const first = (type === 'video' ? config.video : config.image)[0]
    if (first && !models.some(m => m.modelName === modelName)) {
      form.setFieldsValue({ model: first.modelName, resolution: first.resolution?.[0] ?? (type === 'video' ? '720' : '1K'), ratio: first.size?.[0] ?? (type === 'video' ? '16:9' : '1:1'), duration: first.duration?.[0] ?? 5 })
    }
  }, [type, config, form, modelName, models])

  const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  const updateUploadPreview = async (fileList?: UploadFile[]) => {
    const file = fileList?.[0]?.originFileObj as File | undefined
    if (!file) { setUploadPreview(null); return }
    try {
      setUploadPreview(await fileToDataUrl(file))
    } catch {
      message.error('Reference preview failed')
    }
  }

  const handleGenerationEvent = (event: unknown) => {
    const eventName = generationEventName(event)
    const nextPhase = eventToPhase(event)
    setLastEventName(eventName)
    setEventCount(count => count + 1)
    if (nextPhase) setGenerationPhase(current => current === 'failed' || current === 'completed' ? current : nextPhase)
  }

  const onFinish = async (values: any) => {
    setGenerating(true)
    setGenerationPhase('submitted')
    setGenerationStartedAt(Date.now())
    setElapsedSeconds(0)
    setLastEventName('submitted')
    setEventCount(0)
    setLogs([])
    setImageUrls([])
    setVideoUrls([])
    try {
      let inputImage = values.inputImage
      const file = values.inputImageFile?.[0]?.originFileObj as File | undefined
      if (file) inputImage = await fileToDataUrl(file)
      const result = await generateOreateMedia({ ...values, inputImage }, {
        onLog: line => setLogs(prev => [...prev.slice(-60), line]),
        onEvent: handleGenerationEvent,
      })
      setImageUrls(result.urls)
      setVideoUrls(result.videoUrls)
      if (result.urls.length || result.videoUrls.length) {
        setGenerationPhase('completed')
        setLastEventName('completed')
        message.success('Done')
        window.setTimeout(() => void loadHistory(true), 800)
      } else {
        setGenerationPhase('completed')
        message.warning('Finished but no media URL was parsed')
      }
    } catch (e) {
      setGenerationPhase('failed')
      setLastEventName('error')
      message.error((e as Error).message.includes('No account') ? 'Generation channel unavailable' : (e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const deleteHistoryItem = async (id: number) => {
    try {
      await adminDeleteImageHistory(id)
      setHistory(prev => prev.filter(item => item.id !== id))
      message.success('Deleted')
    } catch (e) {
      message.error((e as Error).message)
    }
  }
  const toggleShare = async (item: GeneratedImageView) => {
    try {
      const updated = await adminToggleImageHistoryShare(item.id, !item.isShared)
      setHistory(prev => prev.map(current => current.id === item.id ? updated : current))
      message.success(updated.isShared ? 'Shared' : 'Unshared')
    } catch (e) {
      message.error((e as Error).message)
    }
  }
  const selectedSummary = useMemo(() => [selectedModel?.factory || 'Oreate', selectedModel?.modelName, ratio, resolution, type === 'video' ? `${duration}s` : undefined].filter(Boolean).join(' / '), [selectedModel, ratio, resolution, duration, type])
  const progressPercent = phasePercent(generationPhase)
  const progressActive = generating || generationPhase === 'completed' || generationPhase === 'failed'
  const modelOptions = models.map(m => ({
    label: `${m.modelName}${m.factory ? ` ? ${m.factory}` : ''}${modelCost(m, m.resolution?.[0], m.duration?.[0]) ? ` ? ${modelCost(m, m.resolution?.[0], m.duration?.[0])}+ credits` : ''}`,
    value: m.modelName,
  }))
  const applyType = (nextType: 'image' | 'video') => {
    const first = (nextType === 'video' ? config.video : config.image)[0]
    form.setFieldsValue({
      type: nextType,
      model: first?.modelName,
      resolution: first?.resolution?.[0] ?? (nextType === 'video' ? '720' : '1K'),
      ratio: first?.size?.[0] ?? (nextType === 'video' ? '16:9' : '1:1'),
      duration: first?.duration?.[0] ?? 5,
    })
  }
  const applyModel = (nextModelName: string) => {
    const nextModel = models.find(m => m.modelName === nextModelName)
    form.setFieldsValue({
      model: nextModelName,
      resolution: nextModel?.resolution?.[0] ?? resolution,
      ratio: nextModel?.size?.[0] ?? form.getFieldValue('ratio'),
      duration: nextModel?.duration?.[0] ?? form.getFieldValue('duration'),
    })
  }

  return <div className="oreate-studio oreate-redesign">
    <section className="oreate-commandbar">
      <div className="oreate-brandmark"><Sparkles size={16}/></div>
      <div className="oreate-commandbar__main">
        <div className="oreate-eyebrow">Oreate Creative Console</div>
        <h1>{type === 'video' ? 'Video workspace' : 'Image workspace'}</h1>
        <p>{selectedSummary}</p>
      </div>
      <div className="oreate-commandbar__metrics">
        <span>{models.length} models</span>
        <span>{history.length} history</span>
        <strong><Wand2 size={16}/>{cost ? `${cost} credits` : 'Cost dynamic'}</strong>
      </div>
    </section>
    {configError && <div className="oreate-alert">{configError}</div>}

    <div className="oreate-console-grid">
      <main className="oreate-creation-board">
        <section className="oreate-output-card" aria-live="polite">
          <div className="oreate-section-head">
            <div><span>Live output</span><strong>{latestMediaCount ? `${latestMediaCount} asset(s)` : generating ? 'Rendering' : 'Ready'}</strong></div>
            {cost && <Tag color="gold">{cost} credits</Tag>}
          </div>
          {progressActive && <div className={`oreate-generation-progress is-${generationPhase}`}>
            <div className="oreate-generation-progress__top">
              <strong>{phaseLabel(generationPhase)}</strong>
              <span>{formatElapsed(elapsedSeconds)}</span>
            </div>
            <div className="oreate-generation-progress__bar" aria-label="??????" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent} role="progressbar">
              <i style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="oreate-generation-progress__steps">
              {PHASE_STEPS.map(step => <span key={step.key} className={progressPercent >= step.percent ? 'done' : ''}>{step.label}</span>)}
            </div>
            <p>?????{lastEventName} ? ??? {eventCount} ? SSE ??{generating ? ' ? ???????' : ''}</p>
          </div>}
          {latestMediaCount ? <div className="oreate-output-grid">{imageUrls.map(url => <GeneratedMediaImage key={url} url={url} alt="Generated result" onOpen={() => setPreview(url)} />)}{videoUrls.map(url => <video key={url} className="oreate-output-media" src={url} controls />)}</div> : <div className="oreate-showcase-empty">
            <div className="oreate-showcase-empty__orb"><Sparkles size={26}/></div>
            <strong>{generating ? 'Generating from SSE stream...' : 'Result preview appears here'}</strong>
            <span>{generating ? 'Keep this page open while Oreate returns the media URL.' : 'Choose model, write prompt, generate. No extra scrolling needed.'}</span>
          </div>}
          {referencePreview && <button type="button" className="oreate-reference-chip" onClick={() => setPreview(referencePreview)}>
            <img src={referencePreview} alt="Reference preview" />
            <span><strong>Reference</strong><small>Click to preview</small></span>
          </button>}
        </section>

        <section className="oreate-prompt-card">
          <Form form={form} layout="vertical" initialValues={{ type:'image', model:FALLBACK.image[0].modelName, ratio:'1:1', resolution:'1K', duration:5 }} onFinish={onFinish}>
            <Form.Item name="type" hidden><Input /></Form.Item>
            <div className="oreate-mode-switch">
              <button type="button" className={type==='image'?'active':''} onClick={() => applyType('image')}><ImagePlus size={16}/>Image</button>
              <button type="button" className={type==='video'?'active':''} onClick={() => applyType('video')}><Video size={16}/>Video</button>
            </div>
            <div className="oreate-model-select-row">
              <Form.Item name="model" label="Model">
                <Select showSearch options={modelOptions} optionFilterProp="label" onChange={applyModel} />
              </Form.Item>
              <div className="oreate-model-summary">
                <strong>{selectedModel?.factory || 'Oreate'}</strong>
                <span>{descText(selectedModel?.modelDesc)}</span>
              </div>
            </div>
            <div className="oreate-control-grid"><Form.Item name="ratio" label="Ratio"><Select options={ratios.map(v => ({ label: v, value: v }))}/></Form.Item><Form.Item name="resolution" label="Quality"><Select options={resolutions.map(v => ({ label: v, value: v }))}/></Form.Item>{type==='video' && <Form.Item name="duration" label="Duration"><Select options={durations.map(v => ({ label: `${v}s`, value: v }))}/></Form.Item>}</div>
            <Form.Item name="prompt" label="Prompt" rules={[{ required: true, message: 'Input prompt' }]}><Input.TextArea rows={5} maxLength={2000} showCount placeholder="Describe subject, scene, style, camera, color, composition..." /></Form.Item>
            {type==='image' && <div className="oreate-ref-inputs">
              <Form.Item name="inputImage" label="Edit image URL"><Input allowClear placeholder="https://..." /></Form.Item>
              <Form.Item name="inputImageFile" label="Upload reference" valuePropName="fileList" getValueFromEvent={e => e?.fileList}>
                <Upload beforeUpload={() => false} maxCount={1} accept="image/*" onChange={e => void updateUploadPreview(e.fileList)} onRemove={() => { setUploadPreview(null); return true }}><Button icon={<UploadCloud size={15}/>}>Choose image</Button></Upload>
              </Form.Item>
            </div>}
            <Space wrap className="oreate-submit-row"><Button type="primary" size="large" htmlType="submit" disabled={generating} icon={generating ? <LoaderCircle className="oreate-spin" size={16}/> : <Sparkles size={16}/>}>{generating ? 'Generating' : 'Generate now'}</Button>{latestMediaCount > 0 && <Tag color="green">Latest {latestMediaCount}</Tag>}</Space>
          </Form>
        </section>
      </main>

      <aside className="oreate-history-panel">
        <div className="oreate-history__head">
          <span><Clock3 size={15}/> History</span>
          <button type="button" onClick={() => void loadHistory()} disabled={historyLoading}><RefreshCw size={14}/>Refresh</button>
        </div>
        {history.length ? <div className="oreate-history__list">{history.map(item => {
          const media = firstHistoryMedia(item)
          return <article key={item.id} className="oreate-history__item">
            <button type="button" className="oreate-history__thumb" onClick={() => media && (item.type === 'video' ? window.open(media, '_blank', 'noopener,noreferrer') : setPreview(media))}>{media ? (item.type === 'video' ? <video src={media} muted /> : <img src={displayImage(media)} alt="History thumbnail" loading="lazy" />) : <span />}</button>
            <div>
              <strong>{item.model || (item.type === 'video' ? 'Oreate video' : 'Oreate image')}</strong>
              <p>{item.prompt || 'No prompt'}</p>
              <small>{[item.type || 'image', item.size, formatHistoryTime(item.createdAt)].filter(Boolean).join(' / ')}</small>
              <div className="oreate-history__actions">
                <button type="button" onClick={() => void toggleShare(item)}><Share2 size={12}/>{item.isShared ? 'Unshare' : 'Share'}</button>
                <button type="button" className="danger" onClick={() => void deleteHistoryItem(item.id)}><Trash2 size={12}/>Delete</button>
              </div>
            </div>
          </article>
        })}</div> : <div className="oreate-history-empty"><Clock3 size={20}/><strong>{historyLoading ? 'Loading history' : 'No generated history'}</strong><span>Oreate image results are saved to the same image history table as the old generator.</span></div>}
      </aside>
    </div>

    {logs.length ? <details className="oreate-logs"><summary>Logs</summary><pre>{logs.join('\n')}</pre></details> : null}
    {preview && <ImagePreviewOverlay src={preview} onClose={() => setPreview(null)} />}
  </div>
}
