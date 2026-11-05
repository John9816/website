import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import DOMPurify from 'dompurify'
import { Link } from 'react-router-dom'
import {
  Alert,
  App as AntApp,
  AutoComplete,
  Badge,
  Button,
  Card,
  Checkbox,
  Divider,
  Drawer,
  Empty,
  Form,
  Image,
  Input,
  List,
  Progress,
  Segmented,
  Select,
  Skeleton,
  Space,
  Steps,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloudUploadOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  FireOutlined,
  LinkOutlined,
  PictureOutlined,
  ReloadOutlined,
  RocketOutlined,
  SaveOutlined,
  SendOutlined,
  SettingOutlined,
  SyncOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {
  adminCreateWechatDraft,
  adminDeleteContentArticle,
  adminGenerateContentArticleAsync,
  adminGetContentAgentJob,
  adminGetContentAutomation,
  adminGetContentAutopilot,
  adminGetContentArticle,
  adminGetContentStatus,
  adminGetHotTopics,
  adminListContentArticles,
  adminPublishWechatArticle,
  adminRefreshContentArticleVisuals,
  adminRetryContentAutomationJob,
  adminReviseContentArticle,
  adminRunContentAutopilot,
  adminRunContentAgent,
  adminUpdateContentAutopilot,
  adminUpdateContentArticle,
} from '../api/admin'
import type {
  ContentAgentRunJob,
  ContentAutopilotSettings,
  ContentAutomationStage,
  ContentAutomationStatus,
  ContentAutomationView,
  ContentArticle,
  ContentArticleCategory,
  ContentArticleGeneratePayload,
  ContentArticleImageMode,
  ContentArticleLayoutTheme,
  ContentArticleLength,
  ContentArticleResearchDepth,
  ContentArticleStatus,
  ContentFactoryStatus,
  ContentHotTopic,
  ContentQualityGate,
} from '../types'
import { writeClipboardText } from '../utils/clipboard'
import '../styles/admin-content-factory.css'

type GenerateValues = {
  category: ContentArticleCategory
  topic?: string
  layoutTheme: ContentArticleLayoutTheme
  imageMode: ContentArticleImageMode
  researchEnabled: boolean
  researchDepth: ContentArticleResearchDepth
  length: ContentArticleLength
  generateCover: boolean
  coverStyle?: string
}

type ArticleFormValues = {
  title: string
  category?: string | null
  digest?: string | null
  contentHtml: string
  contentMarkdown?: string | null
  coverImageUrl?: string | null
}

type AutopilotValues = Pick<ContentAutopilotSettings,
  'enabled' | 'times' | 'categories' | 'autoPublish' | 'generateCover'>

type StrategyPreset = {
  key: string
  title: string
  description: string
  values: Partial<GenerateValues>
}

type NormalizedAutomation = ContentAutomationView & {
  source: 'backend' | 'derived'
}

const statusMeta: Record<ContentArticleStatus, { label: string; color: string }> = {
  DRAFT: { label: '草稿', color: 'default' },
  WECHAT_DRAFT: { label: '微信草稿', color: 'processing' },
  PUBLISH_SUBMITTED: { label: '待微信确认', color: 'processing' },
  PUBLISH_FAILED: { label: '微信发布失败', color: 'error' },
  PUBLISHED: { label: '已发布', color: 'success' },
}

function getArticleStatusMeta(article: ContentArticle) {
  if (article.wechatMediaId?.startsWith('local-')) {
    return { label: '本站草稿', color: 'default' }
  }
  return statusMeta[article.status] ?? { label: article.status, color: 'default' }
}

const categoryMeta: Record<
  string,
  {
    label: string
    color: string
    coverStyle: string
    note: string
  }
> = {
  '科技 / 互联网': {
    label: '科技 / 互联网',
    color: 'blue',
    coverStyle: '热点解读感，科技产品和信息流元素，清爽醒目',
    note: '适合 AI、平台规则、互联网产品、商业模式和大厂动态。按爆款推文写法自动成稿。',
  },
  '教育 / 职场': {
    label: '教育 / 职场',
    color: 'gold',
    coverStyle: '职场桌面、学习资料、信息卡片，明亮但不鸡汤',
    note: '适合就业、考证、AI 职场影响、教育政策和个人成长。按爆款推文写法自动成稿。',
  },
  '财政金融': {
    label: '财政金融',
    color: 'cyan',
    coverStyle: '财经数据、城市商业、简洁信息图，可信但不严肃',
    note: '适合消费、宏观政策、公司财报、资本市场和个人财务决策。按爆款推文写法自动成稿。',
  },
}

const defaultCategoryKey = '科技 / 互联网'
const fallbackCategoryMeta = {
  label: '自定义栏目',
  color: 'blue',
  coverStyle: '热点信息卡片，清晰醒目，适合订阅号首图',
  note: '自定义栏目会按你输入的名称保存；正文按爆款公众号写法生成，无需再填语气/读者。',
}

function getCategoryMeta(category?: string | null) {
  if (category && categoryMeta[category]) {
    return categoryMeta[category]
  }
  return {
    ...fallbackCategoryMeta,
    label: category?.trim() || fallbackCategoryMeta.label,
  }
}

const layoutThemeOptions: Array<{ label: string; value: ContentArticleLayoutTheme }> = [
  { label: '清爽', value: 'clean' },
  { label: '温暖', value: 'warm' },
  { label: '杂志', value: 'magazine' },
]

const imageModeOptions: Array<{ label: string; value: ContentArticleImageMode }> = [
  { label: 'AI 生图优先（推荐）', value: 'generate' },
  { label: '开放图库', value: 'fetch' },
  { label: '不配图', value: 'none' },
]

const researchDepthOptions: Array<{ label: string; value: ContentArticleResearchDepth }> = [
  { label: '快搜', value: 'quick' },
  { label: '标准', value: 'standard' },
  { label: '深搜', value: 'deep' },
]

const strategyPresets: StrategyPreset[] = [
  {
    key: 'trend_digest',
    title: '冲打开率',
    description: '短平快：强标题+扎心开场，服务点击与完读。',
    values: {
      researchDepth: 'quick',
      length: 'short',
      layoutTheme: 'clean',
      imageMode: 'generate',
    },
  },
  {
    key: 'evidence_feature',
    title: '冲完读转发',
    description: '长文：场景→拆穿→坑→清单，便于收藏转发。',
    values: {
      researchDepth: 'deep',
      length: 'long',
      layoutTheme: 'magazine',
      imageMode: 'generate',
    },
  },
  {
    key: 'wechat_safe',
    title: '冲关注转化',
    description: '标准篇幅+留言问题+轻关注引导，适合推草稿后人工精修标题。',
    values: {
      researchDepth: 'standard',
      length: 'standard',
      layoutTheme: 'warm',
      imageMode: 'generate',
    },
  },
]

const pipelineSteps = [
  { title: '生成草稿', description: '选题、检索与写作' },
  { title: '质量门', description: '事实、结构与素材' },
  { title: '微信草稿', description: '上传封面与正文' },
  { title: '正式发布', description: '接口或后台确认' },
]

const stageMeta: Record<ContentAutomationStage, { label: string; tone: string }> = {
  topic: { label: '选题', tone: 'blue' },
  editorial_decision: { label: '主编决策', tone: 'blue' },
  research: { label: '检索', tone: 'cyan' },
  evidence: { label: '证据补全', tone: 'cyan' },
  plan: { label: '文章计划', tone: 'purple' },
  generate: { label: '生成', tone: 'purple' },
  review: { label: '审稿', tone: 'gold' },
  quality_gate: { label: '质量门', tone: 'volcano' },
  draft_ready: { label: '草稿就绪', tone: 'gold' },
  local_draft: { label: '本地草稿', tone: 'orange' },
  wechat_draft: { label: '入草稿', tone: 'geekblue' },
  publish: { label: '发布', tone: 'green' },
}

function getStageMeta(stage?: ContentAutomationStage | string | null) {
  if (!stage) return { label: '未开始', tone: 'default' }
  return stageMeta[stage as ContentAutomationStage] ?? { label: String(stage), tone: 'default' }
}


const automationStatusMeta: Record<ContentAutomationStatus, { label: string; badge: 'default' | 'processing' | 'success' | 'error' | 'warning' }> = {
  PENDING: { label: '等待中', badge: 'default' },
  RUNNING: { label: '执行中', badge: 'processing' },
  SUCCESS: { label: '成功', badge: 'success' },
  FAILED: { label: '失败', badge: 'error' },
  SKIPPED: { label: '跳过', badge: 'warning' },
}

const ACTIVE_JOB_STORAGE_KEY = 'content-factory.active-job'

type StoredContentJob = {
  jobId: string
  mode: 'generate' | 'agent' | 'autopilot'
  createdAt: string
}

const defaultGenerateValues: GenerateValues = {
  category: defaultCategoryKey,
  topic: '',
  layoutTheme: 'clean',
  // Prefer open stock images: production AI image group often has no distributor.
  imageMode: 'generate',
  researchEnabled: true,
  researchDepth: 'standard',
  length: 'standard',
  generateCover: true,
  coverStyle: categoryMeta[defaultCategoryKey].coverStyle,
}

function stripHtml(html?: string | null) {
  return (html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

function isReadyInlineImage(image: NonNullable<ContentArticle['inlineImages']>[number]) {
  return image.status === 'READY' && Boolean(image.sourceUrl || image.wechatUrl)
}

function readQualityGate(article: ContentArticle | null): ContentQualityGate | null {
  if (!article?.automation || typeof article.automation !== 'object') return null
  const gate = (article.automation as ContentAutomationView).qualityGate
  if (!gate || typeof gate !== 'object') return null
  return gate as ContentQualityGate
}

function getArticleQuality(article: ContentArticle | null, gateOverride?: ContentQualityGate | null) {
  if (!article) {
    return {
      backendScore: null as number | null,
      localScore: 0,
      words: 0,
      decision: null as string | null,
      reason: null as string | null,
      issues: [] as string[],
      checks: [] as Array<{ label: string; passed: boolean; hint: string }>,
    }
  }

  const text = stripHtml(article.contentHtml || article.contentMarkdown)
  const words = text.length
  const inlineImages = article.inlineImages || []
  const readyInlineImages = inlineImages.filter(isReadyInlineImage)
  const failedInlineImages = inlineImages.filter((image) => image.status === 'FAILED')
  const gate = gateOverride ?? readQualityGate(article)
  const metrics = (gate?.metrics || {}) as Record<string, unknown>
  const readyFromGate =
    typeof metrics.readyInlineImageCount === 'number' ? metrics.readyInlineImageCount : readyInlineImages.length
  const checks = [
    {
      label: '内联图就绪',
      passed: readyFromGate >= 2 && failedInlineImages.length === 0,
      hint: '发布就绪文章需要 2-3 张可用内联图，且不能包含失败资产。',
    },
    { label: '标题完整', passed: article.title.trim().length >= 8, hint: '标题建议 8-32 字，别太短也别塞满关键词。' },
    { label: '摘要可用', passed: Boolean(article.digest && article.digest.trim().length >= 24), hint: '摘要会影响分享卡片和草稿可读性。' },
    { label: '正文充足', passed: words >= 1200, hint: '标准公众号正文建议至少 1200 字。' },
    { label: '封面就绪', passed: Boolean(article.coverImageUrl || metrics.hasCoverImage === true), hint: '缺少封面会阻断微信草稿同步。' },
    {
      label: '证据与计划',
      passed: Boolean(gate?.hasEvidence || (article.evidenceSources && article.evidenceSources.length > 0))
        && Boolean(gate?.hasPlan || article.plan),
      hint: '缺少证据包或写作计划时，事实与结构稳定性更弱。',
    },
    { label: '风险较低', passed: article.riskTips.length === 0, hint: '存在风险提示时建议人工审稿。' },
  ]
  const localScore = Math.round((checks.filter((item) => item.passed).length / checks.length) * 100)
  const backendScore = gate
    ? typeof article.qualityScore === 'number'
      ? article.qualityScore
      : typeof gate.score === 'number'
        ? gate.score
        : null
    : null
  const issues = Array.isArray(gate?.issues)
    ? gate.issues.filter((item): item is string => typeof item === 'string')
    : article.errorMessage
      ? [article.errorMessage]
      : []

  return {
    backendScore,
    localScore,
    words,
    decision: gate?.decision || null,
    reason: gate?.reason || article.errorMessage || null,
    issues,
    checks,
  }
}

function isAutomationView(value: unknown): value is ContentAutomationView {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ContentAutomationView>
  return Array.isArray(candidate.logs) || Array.isArray(candidate.jobs) || Array.isArray(candidate.publishRecords)
}

function deriveAutomation(article: ContentArticle | null): NormalizedAutomation {
  if (!article) {
    return { source: 'derived', currentStage: 'topic', logs: [], jobs: [], publishRecords: [] }
  }

  const backendAutomation = isAutomationView(article.automation) ? article.automation : null
  if (backendAutomation) {
    return {
      source: 'backend',
      currentStage: backendAutomation.currentStage ?? inferStage(article),
      logs: backendAutomation.logs ?? [],
      jobs: backendAutomation.jobs ?? [],
      publishRecords: backendAutomation.publishRecords ?? [],
    }
  }

  return {
    source: 'derived',
    currentStage: inferStage(article),
    logs: [],
    jobs: [],
    publishRecords: [],
  }
}

function waitForPoll(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      window.clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function isAgentJobFinished(job: ContentAgentRunJob) {
  return job.status === 'SUCCESS' || job.status === 'FAILED'
}

function inferStage(article: ContentArticle): ContentAutomationStage {
  if (article.status === 'PUBLISHED' || article.status === 'PUBLISH_SUBMITTED' || article.status === 'PUBLISH_FAILED') return 'publish'
  if (article.status === 'WECHAT_DRAFT' && !article.wechatMediaId?.startsWith('local-')) return 'wechat_draft'
  if (article.riskTips.length) return 'review'
  return 'generate'
}

function isCancelledRequest(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  return (error as { code?: number; name?: string } | null)?.code === -2
    || (error as { name?: string } | null)?.name === 'AbortError'
}

function readStoredJob(): StoredContentJob | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(ACTIVE_JOB_STORAGE_KEY) || 'null') as Partial<StoredContentJob> | null
    if (!value?.jobId || !['generate', 'agent', 'autopilot'].includes(value.mode || '')) return null
    return {
      jobId: value.jobId,
      mode: value.mode as StoredContentJob['mode'],
      createdAt: value.createdAt || new Date().toISOString(),
    }
  } catch {
    window.localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY)
    return null
  }
}

function storeActiveJob(job: StoredContentJob | null) {
  if (job) {
    window.localStorage.setItem(ACTIVE_JOB_STORAGE_KEY, JSON.stringify(job))
  } else {
    window.localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY)
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return '未记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatAutopilotBlocker(value: string) {
  const reasons: Record<string, string> = {
    'Configure AI model endpoint and key': '文章模型地址或密钥未配置',
    'Configure image generation endpoint and key': '图片模型地址或密钥未配置',
    'Configure WeChat AppID and AppSecret': '公众号 AppID 或 AppSecret 未配置',
    'The official account has no freepublish permission': '当前公众号没有接口发布权限，请关闭自动群发',
  }
  return reasons[value] || value
}

export default function AdminContentFactory() {
  const { message, modal } = AntApp.useApp()
  const [generateForm] = Form.useForm<GenerateValues>()
  const [articleForm] = Form.useForm<ArticleFormValues>()
  const [autopilotForm] = Form.useForm<AutopilotValues>()
  const [status, setStatus] = useState<ContentFactoryStatus | null>(null)
  const [autopilot, setAutopilot] = useState<ContentAutopilotSettings | null>(null)
  const [hotTopics, setHotTopics] = useState<ContentHotTopic[]>([])
  const [articles, setArticles] = useState<ContentArticle[]>([])
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([])
  const [activeCategory, setActiveCategory] = useState<ContentArticleCategory>(defaultGenerateValues.category)
  const [activeArticle, setActiveArticle] = useState<ContentArticle | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [autopilotError, setAutopilotError] = useState<string | null>(null)
  const [autopilotLoading, setAutopilotLoading] = useState(false)
  const [autopilotSaving, setAutopilotSaving] = useState(false)
  const [autopilotRunning, setAutopilotRunning] = useState(false)
  const [hotLoading, setHotLoading] = useState(false)
  const [articlesLoading, setArticlesLoading] = useState(false)
  const [articleDetailLoading, setArticleDetailLoading] = useState(false)
  const [automationLoading, setAutomationLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generatePhase, setGeneratePhase] = useState<string | null>(null)
  const [agentRunning, setAgentRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingArticleId, setDeletingArticleId] = useState<number | null>(null)
  const [wechatAction, setWechatAction] = useState<'draft' | 'publish' | null>(null)
  const [revising, setRevising] = useState(false)
  const [refreshingVisuals, setRefreshingVisuals] = useState(false)
  const [activePresetKey, setActivePresetKey] = useState(strategyPresets[0].key)
  const [automation, setAutomation] = useState<NormalizedAutomation | null>(null)
  const [automationArticleId, setAutomationArticleId] = useState<number | null>(null)
  const [pendingJob, setPendingJob] = useState<StoredContentJob | null>(() => readStoredJob())
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const pollControllerRef = useRef<AbortController | null>(null)
  const activePollIdRef = useRef(0)
  const generationRunIdRef = useRef(0)
  const automationRequestIdRef = useRef(0)

  const watchedHtml = Form.useWatch('contentHtml', articleForm)
  const watchedCoverImage = Form.useWatch('coverImageUrl', articleForm)
  const watchedTopic = Form.useWatch('topic', generateForm)

  const selectedTopics = useMemo(() => {
    const selected = hotTopics.filter((topic) => selectedTopicIds.includes(topic.id))
    return selected.length ? selected : hotTopics.slice(0, 5)
  }, [hotTopics, selectedTopicIds])

  const activePreset = useMemo(
    () => strategyPresets.find((preset) => preset.key === activePresetKey) || strategyPresets[0],
    [activePresetKey],
  )
  const categoryOptions = useMemo(() => {
    const values = new Map<string, { value: string; label: string }>()
    Object.entries(categoryMeta).forEach(([value, meta]) => {
      values.set(value, { value, label: meta.label })
    })
    articles.forEach((article) => {
      const value = article.category?.trim()
      if (value && !values.has(value)) {
        values.set(value, { value, label: value })
      }
    })
    return Array.from(values.values())
  }, [articles])

  const qualityGate = useMemo(
    () => (automationArticleId === activeArticle?.id ? automation?.qualityGate : null) ?? readQualityGate(activeArticle),
    [activeArticle, automation?.qualityGate, automationArticleId],
  )
  const quality = useMemo(() => getArticleQuality(activeArticle, qualityGate), [activeArticle, qualityGate])
  const inlineImages = activeArticle?.inlineImages ?? []
  const readyInlineImages = inlineImages.filter(isReadyInlineImage)
  const failedInlineImages = inlineImages.filter((image) => image.status === 'FAILED')
  const inlineImagesReady = readyInlineImages.length >= 2 && failedInlineImages.length === 0
  const getConfigReady = (key: string) => status?.configs.find((item) => item.key === key)?.ready
  const hasDefaultWechatCover = getConfigReady('wechat.coverMediaId') === true
  const freePublishEnabled = getConfigReady('wechat.freePublishEnabled') === true
  const autopilotEnabled = getConfigReady('content.autopilot.enabled') === true
  const autopilotAutoPublish = getConfigReady('content.autopilot.autoPublish') === true
  const backendPublishable = qualityGate?.publishable === true || qualityGate?.decision === 'pass'
  const hasRealWechatDraft = Boolean(
    activeArticle
      && ['WECHAT_DRAFT', 'PUBLISH_SUBMITTED', 'PUBLISH_FAILED', 'PUBLISHED'].includes(activeArticle.status)
      && activeArticle.wechatMediaId
      && !activeArticle.wechatMediaId.startsWith('local-'),
  )
  const activeArticleAssetsReady = Boolean(
    activeArticle
      && (activeArticle.coverImageUrl || hasDefaultWechatCover)
      && inlineImagesReady
      && backendPublishable
      && !activeArticle.errorMessage,
  )
  const workflowStep = activeArticle?.status === 'PUBLISHED'
    ? 3
    : activeArticle?.status === 'PUBLISH_SUBMITTED' || activeArticle?.status === 'PUBLISH_FAILED'
      ? 3
    : hasRealWechatDraft
      ? 2
      : backendPublishable
        ? 2
        : activeArticle
          ? 1
          : 0
  const workflowHasError = Boolean(activeArticle?.errorMessage || qualityGate?.decision === 'block' || activeArticle?.status === 'PUBLISH_FAILED')
  const nextAction = !activeArticle
    ? '先生成一篇本站草稿'
    : !qualityGate
      ? '运行定向改写，生成后端质量门结果'
      : !backendPublishable
        ? '根据质量门问题改稿后重新检查'
        : !hasRealWechatDraft
          ? status?.wechatReady
            ? '将已通过质检的文章存入微信草稿箱'
            : '在系统配置中补齐微信公众号凭据'
          : activeArticle.status === 'PUBLISH_SUBMITTED'
            ? '微信正在确认发布结果，稍后刷新文章状态'
            : activeArticle.status === 'PUBLISH_FAILED'
              ? '查看失败原因，处理后再提交'
              : activeArticle.status !== 'PUBLISHED'
            ? freePublishEnabled
              ? '复核后提交正式发布'
              : '到微信公众平台人工确认发布'
            : '本篇文章已完成发布'
  const riskCount = activeArticle?.riskTips.length ?? 0
  const publishBlocked =
    !status?.wechatReady
    || !freePublishEnabled
    || !activeArticleAssetsReady
    || Boolean(activeArticle?.errorMessage)
    || activeArticle?.status === 'PUBLISH_SUBMITTED'
    || activeArticle?.status === 'PUBLISHED'
    || generating
    || saving
    || Boolean(wechatAction)
  const sanitizedPreviewHtml = useMemo(
    () => DOMPurify.sanitize(watchedHtml || activeArticle?.contentHtml || '', {
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea'],
      FORBID_ATTR: ['srcdoc'],
    }),
    [activeArticle?.contentHtml, watchedHtml],
  )

  const loadStatus = async () => {
    setStatusLoading(true)
    setStatusError(null)
    try {
      const data = await adminGetContentStatus()
      if (mountedRef.current) setStatus(data)
    } catch (error) {
      if (!mountedRef.current) return
      const errorMessage = (error as Error).message
      setStatusError(errorMessage)
      message.error(errorMessage)
    } finally {
      if (mountedRef.current) setStatusLoading(false)
    }
  }

  const loadAutopilot = async () => {
    setAutopilotLoading(true)
    setAutopilotError(null)
    try {
      const data = await adminGetContentAutopilot()
      if (!mountedRef.current) return
      setAutopilot(data)
      autopilotForm.setFieldsValue({
        enabled: data.enabled,
        times: data.times,
        categories: data.categories,
        autoPublish: data.autoPublish,
        generateCover: data.generateCover,
      })
    } catch (error) {
      if (mountedRef.current) setAutopilotError((error as Error).message)
    } finally {
      if (mountedRef.current) setAutopilotLoading(false)
    }
  }

  const saveAutopilot = async () => {
    const values = await autopilotForm.validateFields()
    const times = Array.from(new Set(values.times.map((item) => item.trim()).filter(Boolean))).sort()
    const categories = values.categories.map((item) => item.trim()).filter(Boolean)
    if (times.some((item) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(item))) {
      message.warning('运行时间需使用 HH:mm 格式，例如 08:30')
      return
    }
    setAutopilotSaving(true)
    try {
      const data = await adminUpdateContentAutopilot({ ...values, times, categories })
      setAutopilot(data)
      autopilotForm.setFieldsValue(data)
      message.success(data.enabled ? '自动驾驶计划已保存并启用' : '自动驾驶计划已保存，当前暂停')
      await loadStatus()
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setAutopilotSaving(false)
    }
  }

  const runAutopilotNow = async () => {
    const runId = ++generationRunIdRef.current
    setAutopilotRunning(true)
    setGeneratePhase('自动驾驶任务正在启动…')
    try {
      const started = await adminRunContentAutopilot()
      const storedJob = { jobId: started.jobId, mode: 'autopilot' as const, createdAt: new Date().toISOString() }
      storeActiveJob(storedJob)
      if (mountedRef.current) setPendingJob(storedJob)
      const job = await pollJobUntilDone(started.jobId, (current) => {
        if (current.automation) {
          setAutomation({ ...current.automation, source: 'backend' })
          setAutomationArticleId(current.article?.id ?? null)
        }
        setGeneratePhase(jobPhaseLabel(current))
      })
      await finishGenerateJob(job, '自动驾驶任务已完成，请检查文章和微信草稿状态')
    } catch (error) {
      if (!isCancelledRequest(error)) message.error((error as Error).message)
    } finally {
      if (mountedRef.current && generationRunIdRef.current === runId) {
        setAutopilotRunning(false)
        setGeneratePhase(null)
      }
    }
  }

  const loadHotTopics = async (category = activeCategory) => {
    setHotLoading(true)
    try {
      const data = await adminGetHotTopics(18, category)
      setHotTopics(data.items)
      setSelectedTopicIds((previous) =>
        previous.filter((id) => data.items.some((topic) => topic.id === id)),
      )
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setHotLoading(false)
    }
  }

  const loadArticles = async () => {
    setArticlesLoading(true)
    try {
      const data = await adminListContentArticles(0, 12)
      setArticles(data.items)
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setArticlesLoading(false)
    }
  }

  const loadAutomation = async (articleId?: number) => {
    const requestId = ++automationRequestIdRef.current
    setAutomationLoading(true)
    try {
      const data = await adminGetContentAutomation(articleId)
      if (!mountedRef.current || requestId !== automationRequestIdRef.current) return
      setAutomation(data ? { ...data, source: 'backend' } : null)
      setAutomationArticleId(articleId ?? null)
    } catch {
      if (!mountedRef.current || requestId !== automationRequestIdRef.current) return
      setAutomation(articleId && activeArticle?.id === articleId ? deriveAutomation(activeArticle) : null)
      setAutomationArticleId(articleId ?? null)
    } finally {
      if (mountedRef.current && requestId === automationRequestIdRef.current) setAutomationLoading(false)
    }
  }

  const retryJob = async (jobId: string) => {
    setRetryingJobId(jobId)
    try {
      const data = await adminRetryContentAutomationJob(jobId)
      setAutomation({ ...data, source: 'backend' })
      setAutomationArticleId(activeArticle?.id ?? null)
      const retriedJob = data.jobs.find((item) => item.id === jobId)
      if (retriedJob?.status === 'FAILED') {
        message.error(retriedJob.errorMessage || '重试仍然失败，请查看任务日志')
      } else {
        message.success('重试已执行，任务状态已更新')
      }
      await loadArticles()
      if (activeArticle) {
        const detail = await adminGetContentArticle(activeArticle.id)
        setActiveArticle((current) => current?.id === detail.id ? detail : current)
      }
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setRetryingJobId(null)
    }
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      activePollIdRef.current += 1
      automationRequestIdRef.current += 1
      pollControllerRef.current?.abort()
      pollControllerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!activeArticle) return
    articleForm.setFieldsValue({
      title: activeArticle.title,
      digest: activeArticle.digest || '',
      category: activeArticle.category || '',
      contentHtml: activeArticle.contentHtml,
      contentMarkdown: activeArticle.contentMarkdown || '',
      coverImageUrl: activeArticle.coverImageUrl || '',
    })
  }, [activeArticle, articleForm])

  useEffect(() => {
    void loadAutomation(activeArticle?.id)
  }, [activeArticle?.id])

  const upsertArticle = (article: ContentArticle) => {
    setArticles((previous) => [article, ...previous.filter((item) => item.id !== article.id)])
    setActiveArticle(article)
    setAutomation(deriveAutomation(article))
    setAutomationArticleId(article.id)
  }

  const toggleTopic = (topicId: string, checked: boolean) => {
    setSelectedTopicIds((previous) =>
      checked ? [...new Set([...previous, topicId])] : previous.filter((id) => id !== topicId),
    )
  }

  /** Fill the core topic input from a hot item (one-click, does not toggle selection). */
  const fillTopicFromHot = (topic: ContentHotTopic) => {
    generateForm.setFieldValue('topic', topic.title)
    setSelectedTopicIds((previous) =>
      previous.includes(topic.id) ? previous : [...previous, topic.id],
    )
    message.success(`已填入话题：${topic.title}`)
  }

  const jobPhaseLabel = (job: ContentAgentRunJob) => {
    if (job.stageLabel?.trim()) return job.stageLabel.trim()
    if (job.status === 'PENDING') return '排队中…'
    if (job.status === 'FAILED') return job.errorMessage || '失败'
    if (job.status === 'SUCCESS') return '草稿已就绪'
    if (job.stage === 'research') return '在找公开线索…'
    if (job.stage === 'plan') return '在定核心判断与小节…'
    if (job.stage === 'write') return '在写正文…'
    if (job.stage === 'review') return '在审稿与定向改写…'
    if (job.stage === 'visual') return '在配封面和插图…'
    if (job.stage === 'gate') return '在做发布就绪检查…'
    if (job.stage === 'topic') return '自动选题中…'
    return '处理中…'
  }

  const changeCategory = (category: string, applyDefaults = false) => {
    const nextCategory = category.trim()
    if (!nextCategory) return
    const meta = getCategoryMeta(nextCategory)
    setActiveCategory(nextCategory)
    setSelectedTopicIds([])
    if (applyDefaults) {
      generateForm.setFieldsValue({
        category: nextCategory,
        coverStyle: meta.coverStyle,
      })
    } else {
      generateForm.setFieldValue('category', nextCategory)
    }
    void loadHotTopics(nextCategory)
  }

  const applyPreset = (preset: StrategyPreset) => {
    setActivePresetKey(preset.key)
    generateForm.setFieldsValue({
      ...preset.values,
      category: activeCategory,
    })
  }

  const pollJobUntilDone = async (jobId: string, onTick?: (job: ContentAgentRunJob) => void) => {
    pollControllerRef.current?.abort()
    const controller = new AbortController()
    const pollId = activePollIdRef.current + 1
    activePollIdRef.current = pollId
    pollControllerRef.current = controller

    try {
      let job = await adminGetContentAgentJob(jobId, controller.signal)
      if (!mountedRef.current || activePollIdRef.current !== pollId) {
        throw new DOMException('Aborted', 'AbortError')
      }
      onTick?.(job)
      for (let attempt = 0; attempt < 200 && !isAgentJobFinished(job); attempt += 1) {
        await waitForPoll(attempt < 8 ? 1200 : attempt < 30 ? 2000 : 3000, controller.signal)
        job = await adminGetContentAgentJob(jobId, controller.signal)
        if (!mountedRef.current || activePollIdRef.current !== pollId) {
          throw new DOMException('Aborted', 'AbortError')
        }
        onTick?.(job)
      }
      return job
    } finally {
      if (pollControllerRef.current === controller) {
        pollControllerRef.current = null
      }
    }
  }

  const finishGenerateJob = async (job: ContentAgentRunJob, successFallback: string) => {
    if (!isAgentJobFinished(job)) {
      message.warning('生成仍在后台运行，请稍后刷新「最近生成」列表查看')
      await loadArticles()
      return
    }
    storeActiveJob(null)
    setPendingJob(null)
    if (job.status === 'FAILED') {
      message.error(job.errorMessage || '生成失败')
      if (job.automation) setAutomation({ ...job.automation, source: 'backend' })
      await loadArticles()
      return
    }
    if (!job.article) {
      message.warning('任务已完成但未返回文章，请刷新列表')
      await loadArticles()
      return
    }
    upsertArticle(job.article)
    if (job.automation) {
      setAutomation({ ...job.automation, source: 'backend' })
      setAutomationArticleId(job.article.id)
    }
    setDrawerOpen(true)
    await loadArticles()
    if (job.article.errorMessage) {
      message.warning(`草稿已生成，但尚未达到发布就绪：${job.article.errorMessage}`)
    } else if (job.draft?.mode === 'wechat') {
      message.success('文章已生成并进入微信草稿箱')
    } else {
      message.success(successFallback)
    }
  }

  const generateArticle = async () => {
    const runId = ++generationRunIdRef.current
    const values = await generateForm.validateFields()
    const topic = values.topic?.trim()
    if (!topic && selectedTopics.length === 0) {
      message.warning('请填写核心话题，或先勾选下方热点选题')
      return
    }
    const payload: ContentArticleGeneratePayload = {
      ...values,
      topic: topic || selectedTopics[0]?.title,
      category: activeCategory,
      autoPublish: false,
      // WeChat draft only after human confirms readiness; gate blocks anyway when not ready.
      autoWechatDraft: false,
      generateCover: values.imageMode !== 'none',
      researchEnabled: values.researchEnabled !== false,
      topics: selectedTopics,
    }

    setGenerating(true)
    setGeneratePhase('已提交生成任务…')
    try {
      const started = await adminGenerateContentArticleAsync(payload)
      const storedJob = { jobId: started.jobId, mode: 'generate' as const, createdAt: new Date().toISOString() }
      storeActiveJob(storedJob)
      if (mountedRef.current) setPendingJob(storedJob)
      message.info(`生成任务已启动：${started.jobId}`)
      const job = await pollJobUntilDone(started.jobId, (current) => {
        setGeneratePhase(jobPhaseLabel(current))
      })
      await finishGenerateJob(job, '文章草稿已生成，可在右侧检查质量后推微信')
    } catch (error) {
      if (!isCancelledRequest(error)) message.error((error as Error).message)
    } finally {
      if (mountedRef.current && generationRunIdRef.current === runId) {
        setGenerating(false)
        setGeneratePhase(null)
      }
    }
  }

  const runContentAgent = async () => {
    const runId = ++generationRunIdRef.current
    const values = generateForm.getFieldsValue()
    const topic = values.topic?.trim()
    setAgentRunning(true)
    setGeneratePhase('自动选题 Agent 启动…')
    try {
      const started = await adminRunContentAgent({
        category: activeCategory,
        topic: topic || undefined,
        instruction: activePreset.description,
        length: values.length || 'standard',
        generateCover: values.imageMode !== 'none',
        // Prefer local draft first; user pushes WeChat after quality check.
        autoWechatDraft: false,
        autoPublish: false,
      })
      const storedJob = { jobId: started.jobId, mode: 'agent' as const, createdAt: new Date().toISOString() }
      storeActiveJob(storedJob)
      if (mountedRef.current) setPendingJob(storedJob)
      message.info(`Agent 任务已启动：${started.jobId}`)
      const job = await pollJobUntilDone(started.jobId, (current) => {
        if (current.automation) {
          setAutomation({ ...current.automation, source: 'backend' })
          setAutomationArticleId(current.article?.id ?? null)
        }
        setGeneratePhase(jobPhaseLabel(current))
      })
      await finishGenerateJob(job, 'Agent 已完成：草稿可检查后推微信')
    } catch (error) {
      if (!isCancelledRequest(error)) message.error((error as Error).message)
    } finally {
      if (mountedRef.current && generationRunIdRef.current === runId) {
        setAgentRunning(false)
        setGeneratePhase(null)
      }
    }
  }

  const resumePendingJob = async (storedJob: StoredContentJob) => {
    const runId = ++generationRunIdRef.current
    if (storedJob.mode === 'autopilot') setAutopilotRunning(true)
    else if (storedJob.mode === 'agent') setAgentRunning(true)
    else setGenerating(true)
    setGeneratePhase(`正在恢复任务 ${storedJob.jobId}…`)
    try {
      const job = await pollJobUntilDone(storedJob.jobId, (current) => {
        if (current.automation) {
          setAutomation({ ...current.automation, source: 'backend' })
          setAutomationArticleId(current.article?.id ?? null)
        }
        setGeneratePhase(jobPhaseLabel(current))
      })
      await finishGenerateJob(job, '后台任务已完成，草稿可检查后推微信')
    } catch (error) {
      if (!isCancelledRequest(error)) {
        storeActiveJob(null)
        setPendingJob(null)
        message.error(`无法恢复生成任务：${(error as Error).message}`)
      }
    } finally {
      if (mountedRef.current && generationRunIdRef.current === runId) {
        setGenerating(false)
        setAgentRunning(false)
        setAutopilotRunning(false)
        setGeneratePhase(null)
      }
    }
  }

  useEffect(() => {
    generateForm.setFieldsValue(defaultGenerateValues)
    void loadStatus()
    void loadAutopilot()
    void loadHotTopics(defaultGenerateValues.category)
    void loadArticles()
    const storedJob = readStoredJob()
    if (storedJob) {
      setPendingJob(storedJob)
      void resumePendingJob(storedJob)
    }
  }, [])

  const openArticle = async (article: ContentArticle) => {
    setActiveArticle(article)
    setDrawerOpen(true)
    setArticleDetailLoading(true)
    try {
      const detail = await adminGetContentArticle(article.id)
      setActiveArticle((current) => (current?.id === article.id ? detail : current))
      setArticles((previous) => previous.map((item) => (item.id === detail.id ? { ...item, ...detail } : item)))
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setArticleDetailLoading(false)
    }
  }

  const saveArticle = async () => {
    if (!activeArticle) return
    const values = await articleForm.validateFields()
    setSaving(true)
    try {
      const article = await adminUpdateContentArticle(activeArticle.id, {
        title: values.title,
        category: values.category || '',
        digest: values.digest || '',
        contentHtml: values.contentHtml,
        contentMarkdown: values.contentMarkdown || '',
        coverImageUrl: values.coverImageUrl || '',
      })
      upsertArticle(article)
      message.success('已保存')
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const reviseArticle = async () => {
    if (!activeArticle) return
    setRevising(true)
    try {
      const article = await adminReviseContentArticle(activeArticle.id)
      upsertArticle(article)
      await loadAutomation(article.id)
      if (article.errorMessage) {
        message.warning(`定向改写完成，仍未过门禁：${article.errorMessage}`)
      } else {
        message.success('定向改写完成，质量门禁已更新')
      }
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setRevising(false)
    }
  }

  const refreshVisuals = async () => {
    if (!activeArticle) return
    setRefreshingVisuals(true)
    try {
      const article = await adminRefreshContentArticleVisuals(activeArticle.id)
      upsertArticle(article)
      await loadAutomation(article.id)
      if (article.errorMessage) {
        message.warning(`配图已刷新，仍有交付问题：${article.errorMessage}`)
      } else {
        message.success('封面与内联图已重新生成')
      }
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setRefreshingVisuals(false)
    }
  }

  const createWechatDraft = async () => {
    if (!activeArticle) return
    if (!qualityGate) {
      message.warning('这篇文章还没有后端质量门结果，请先定向改写并重新检查')
      return
    }
    if (!backendPublishable) {
      message.warning(qualityGate.reason || '后端质量门未通过，不能创建微信草稿')
      return
    }
    if (!activeArticleAssetsReady) {
      message.warning('缺少封面或 2 张可用内联图，不能创建微信草稿')
      return
    }
    setWechatAction('draft')
    try {
      const result = await adminCreateWechatDraft(activeArticle.id)
      upsertArticle(result.article)
      await loadAutomation(result.article.id)
      if (result.draft.mode === 'local' || result.draft.mediaId?.startsWith('local-')) {
        message.warning('已保留为本站本地草稿，尚未进入微信草稿箱')
      } else {
        message.success(`已创建微信草稿：${result.draft.mediaId}`)
      }
    } catch (error) {
      message.error((error as Error).message)
      if (activeArticle) {
        await loadAutomation(activeArticle.id)
        await loadArticles()
      }
    } finally {
      setWechatAction(null)
    }
  }

  const publishWechat = () => {
    if (!activeArticle) return
    if (publishBlocked) {
      message.warning('当前文章未达到发布条件')
      return
    }
    modal.confirm({
      title: '发布到微信公众号',
      content: '确认后会创建或更新微信草稿并提交发布。请先核对标题、封面、事实引用和正文预览。',
      okText: '确认发布',
      cancelText: '取消',
      okButtonProps: { icon: <SendOutlined /> },
      onOk: async () => {
        setWechatAction('publish')
        try {
          const result = await adminPublishWechatArticle(activeArticle.id)
          upsertArticle(result.article)
          await loadAutomation(result.article.id)
          const publishId = typeof result.publish.publishId === 'string' ? result.publish.publishId : ''
          if (result.article.status === 'PUBLISHED') {
            message.success('微信已确认发布')
          } else if (result.article.status === 'PUBLISH_FAILED') {
            message.error(result.article.errorMessage || '微信发布失败，请查看任务记录')
          } else {
            message.info(publishId ? `微信已接收发布请求：${publishId}，等待确认` : '微信已接收发布请求，等待确认')
          }
        } catch (error) {
          message.error((error as Error).message)
          if (activeArticle) {
            await loadAutomation(activeArticle.id)
            await loadArticles()
          }
        } finally {
          setWechatAction(null)
        }
      },
    })
  }

  const refreshActiveArticle = async () => {
    if (!activeArticle) return
    setArticleDetailLoading(true)
    try {
      const detail = await adminGetContentArticle(activeArticle.id)
      setActiveArticle((current) => current?.id === detail.id ? detail : current)
      setArticles((previous) => previous.map((item) => item.id === detail.id ? detail : item))
      await loadAutomation(detail.id)
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setArticleDetailLoading(false)
    }
  }

  const deleteArticle = (article: ContentArticle, event?: { stopPropagation: () => void }) => {
    event?.stopPropagation()
    modal.confirm({
      title: '删除生成内容',
      content: article.status === 'PUBLISHED'
        ? '这会删除本站后台中的文章记录，不会撤回微信公众号里已发布的内容。确认删除吗？'
        : '这会删除本站后台中的文章记录，不会删除微信公众号中已创建的草稿。确认删除吗？',
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true, icon: <DeleteOutlined /> },
      onOk: async () => {
        setDeletingArticleId(article.id)
        try {
          await adminDeleteContentArticle(article.id)
          setArticles((previous) => previous.filter((item) => item.id !== article.id))
          if (activeArticle?.id === article.id) {
            setActiveArticle(null)
            setDrawerOpen(false)
          }
          message.success('已删除')
        } catch (error) {
          message.error((error as Error).message)
        } finally {
          setDeletingArticleId(null)
        }
      },
    })
  }

  const allSelected = hotTopics.length > 0 && selectedTopicIds.length === hotTopics.length
  const articleStatus = activeArticle ? getArticleStatusMeta(activeArticle) : null
  const activeArticleCategory = activeArticle?.category ? getCategoryMeta(activeArticle.category) : null
  const activeCategoryMeta = getCategoryMeta(activeCategory)
  const missingWechatCover = Boolean(activeArticle && !activeArticle.coverImageUrl && !hasDefaultWechatCover)
  const missingInlineImages = Boolean(activeArticle && !inlineImagesReady)
  const isLocalWechatDraft = Boolean(activeArticle?.wechatMediaId?.startsWith('local-'))
  const copyText = async (text?: string | null) => {
    if (!text) return
    try {
      await writeClipboardText(text)
      message.success('已复制')
    } catch (error) {
      message.error('复制失败，请手动选择文本')
    }
  }

  return (
    <div className="content-factory">
      <section className="content-factory__header">
        <div>
          <span className="content-factory__eyebrow">公众号生产台</span>
          <Typography.Title level={3}>内容工厂</Typography.Title>
          <Typography.Paragraph type="secondary">
            从热点和自定义话题生成本站草稿，经后端质量门确认后进入微信草稿箱。发布权限与自动驾驶状态均以当前服务配置为准。
          </Typography.Paragraph>
          {generatePhase ? (
            <Alert className="content-factory__running-alert" type="info" showIcon message={generatePhase} />
          ) : null}
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => void loadStatus()} loading={statusLoading}>
            刷新状态
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void loadArticles()} loading={articlesLoading}>
            刷新文章
          </Button>
        </Space>
      </section>

      <section className="content-factory__pipeline" aria-label="内容工厂流程">
        <div className="content-factory__pipeline-heading">
          <div>
            <Typography.Text strong>当前交付链路</Typography.Text>
            <Typography.Text type="secondary">下一步：{nextAction}</Typography.Text>
          </div>
          <Tag color={workflowHasError ? 'error' : activeArticle?.status === 'PUBLISHED' ? 'success' : 'processing'}>
            {activeArticle ? (articleStatus?.label || '处理中') : '等待新草稿'}
          </Tag>
        </div>
        <div className="content-factory__pipeline-main">
          <Steps
            current={workflowStep}
            items={pipelineSteps}
            size="small"
            status={workflowHasError ? 'error' : 'process'}
          />
        </div>
      </section>

      <section className="content-factory__capabilities" aria-label="内容工厂能力状态">
        <div className="content-factory__section-heading">
          <div>
            <Typography.Text strong>生产能力</Typography.Text>
            <Typography.Text type="secondary">状态来自后端实时配置，不展示密钥内容</Typography.Text>
          </div>
          <Link to="/admin/configs" className="content-factory__config-link">
            <SettingOutlined /> 系统配置
          </Link>
        </div>
        {statusLoading && !status ? (
          <Skeleton active paragraph={{ rows: 2 }} />
        ) : statusError && !status ? (
          <Alert
            type="error"
            showIcon
            message="无法读取生产能力"
            description={statusError}
            action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void loadStatus()}>重试</Button>}
          />
        ) : (
          <>
            <div className="content-factory__capability-grid">
              <CapabilityItem
                icon={<EditOutlined />}
                title="文章生成"
                ready={status?.aiReady}
                readyText="模型可用"
                blockedText="缺少模型配置"
              />
              <CapabilityItem
                icon={<PictureOutlined />}
                title="图片素材"
                ready={status?.imageReady}
                readyText="模型可用"
                blockedText="缺少图片配置"
              />
              <CapabilityItem
                icon={<CloudUploadOutlined />}
                title="微信草稿"
                ready={status?.wechatReady}
                readyText="凭据已填写"
                blockedText="缺少公众号凭据"
              />
              <CapabilityItem
                icon={<ClockCircleOutlined />}
                title="自动驾驶"
                ready={status ? autopilotEnabled : undefined}
                readyText="定时运行中"
                blockedText="当前未启用"
                neutralWhenBlocked
              />
              <CapabilityItem
                icon={<SendOutlined />}
                title="接口发布"
                ready={status ? freePublishEnabled : undefined}
                readyText="管理员开关已开"
                blockedText="管理员开关未开"
                neutralWhenBlocked
              />
            </div>
            <div className="content-factory__config-matrix">
              {status?.configs.map((item) => (
                <span key={item.key} className="content-factory__config-state" title={item.key}>
                  <Badge status={item.ready ? 'success' : 'default'} />
                  {item.label}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      {status && !status.wechatReady ? (
        <Alert
          type="warning"
          showIcon
          message="微信公众号未配置"
          description={<>在<Link to="/admin/configs">系统配置</Link>中补齐公众号 AppID 和 AppSecret。本站草稿仍可生成，微信相关操作会保持锁定。</>}
        />
      ) : null}

      {status?.wechatReady && !freePublishEnabled ? (
        <Alert
          type="info"
          showIcon
          message="微信草稿能力可用，接口发布未启用"
          description="系统可以创建真实微信草稿；完成最终复核后，请在微信公众平台手动发布。"
        />
      ) : null}

      {status && autopilotAutoPublish && !freePublishEnabled ? (
        <Alert
          type="warning"
          showIcon
          message="自动群发配置与发布权限不一致"
          description="自动驾驶已请求自动群发，但微信一键发布权限未启用。任务会停在草稿阶段，请在系统配置中修正。"
        />
      ) : null}

      <section className="content-factory__autopilot" aria-label="自动驾驶计划">
        <div className="content-factory__section-heading">
          <div>
            <Typography.Text strong>自动驾驶计划</Typography.Text>
            <Typography.Text type="secondary">
              {autopilot?.enabled
                ? `运行中 · 下次执行 ${formatDateTime(autopilot.nextRunAt)}`
                : '当前暂停'}
            </Typography.Text>
          </div>
          <Space size={8} wrap>
            <Tag color={autopilot?.enabled ? 'success' : 'default'}>
              {autopilot?.enabled ? '定时运行中' : '未启用'}
            </Tag>
            <Button size="small" icon={<ReloadOutlined />} loading={autopilotLoading} onClick={() => void loadAutopilot()}>
              刷新计划
            </Button>
          </Space>
        </div>
        {autopilotError && !autopilot ? (
          <Alert type="error" showIcon message="无法读取自动驾驶计划" description={autopilotError} />
        ) : autopilotLoading && !autopilot ? (
          <Skeleton active paragraph={{ rows: 2 }} />
        ) : autopilot ? (
          <>
            {autopilot.blockers.length ? (
              <Alert
                type="warning"
                showIcon
                message="启用条件尚未满足"
                description={
                  <Space direction="vertical" size={0}>
                    {autopilot.blockers.map((blocker) => (
                      <span key={blocker}>{formatAutopilotBlocker(blocker)}</span>
                    ))}
                    <Link to="/admin/configs">打开系统配置</Link>
                  </Space>
                }
              />
            ) : null}
            <Form form={autopilotForm} layout="vertical" className="content-factory__autopilot-form">
              <Form.Item name="enabled" label="定时运行" valuePropName="checked">
                <Switch
                  checkedChildren="开启"
                  unCheckedChildren="暂停"
                  disabled={!autopilot.enabled && autopilot.blockers.length > 0}
                />
              </Form.Item>
              <Form.Item
                name="times"
                label="每日运行时间"
                rules={[{ required: true, type: 'array', min: 1, max: 12, message: '设置 1-12 个时间' }]}
              >
                <Select
                  mode="tags"
                  tokenSeparators={[',', '，']}
                  placeholder="输入 08:00 后回车"
                  maxTagCount="responsive"
                />
              </Form.Item>
              <Form.Item
                name="categories"
                label="轮换栏目"
                rules={[{ required: true, type: 'array', min: 1, max: 12, message: '设置 1-12 个栏目' }]}
              >
                <Select
                  mode="tags"
                  tokenSeparators={[',', '，']}
                  options={categoryOptions}
                  placeholder="输入栏目后回车"
                  maxTagCount="responsive"
                />
              </Form.Item>
              <Form.Item name="generateCover" label="生成封面" valuePropName="checked">
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
              <Form.Item name="autoPublish" label="自动群发" valuePropName="checked">
                <Switch checkedChildren="开启" unCheckedChildren="草稿" />
              </Form.Item>
              <div className="content-factory__autopilot-actions">
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={autopilotSaving}
                  onClick={() => void saveAutopilot()}
                >
                  保存计划
                </Button>
                <Tooltip title={autopilot.blockers.length ? '请先处理上方启用条件' : '按当前已保存的计划执行一次'}>
                  <Button
                    icon={<RocketOutlined />}
                    loading={autopilotRunning}
                    disabled={autopilot.blockers.length > 0 || generating || agentRunning || Boolean(pendingJob)}
                    onClick={() => void runAutopilotNow()}
                  >
                    立即运行
                  </Button>
                </Tooltip>
              </div>
            </Form>
          </>
        ) : null}
      </section>

      {pendingJob && !generating && !agentRunning && !autopilotRunning ? (
        <Alert
          type="info"
          showIcon
          message={`任务 ${pendingJob.jobId} 仍在后台执行`}
          action={
            <Button size="small" icon={<ReloadOutlined />} onClick={() => void resumePendingJob(pendingJob)}>
              继续跟踪
            </Button>
          }
        />
      ) : null}

      <section className="content-factory__workspace">
        <Card className="content-factory__panel" title="话题研究与生成">
          <div className="content-factory__category-strip">
            <div className="content-factory__category-control">
              <Typography.Text strong>内容栏目</Typography.Text>
              <AutoComplete
                value={activeCategory}
                options={categoryOptions}
                onChange={(value) => {
                  setActiveCategory(value)
                  generateForm.setFieldValue('category', value)
                }}
                onSelect={(value) => changeCategory(value, Boolean(categoryMeta[value]))}
                onBlur={() => changeCategory(activeCategory)}
                filterOption={(inputValue, option) =>
                  Boolean(option?.label?.toString().includes(inputValue) || option?.value?.toString().includes(inputValue))
                }
              />
            </div>
            <Typography.Text type="secondary">{activeCategoryMeta.note}</Typography.Text>
          </div>

          <Form
            form={generateForm}
            layout="vertical"
            initialValues={defaultGenerateValues}
            className="content-factory__generate-form"
          >
            <Form.Item
              name="topic"
              label="核心话题"
              extra="填写后会优先围绕这个话题搜索和写作；不填则使用下方选中的热点作为选题灵感。"
            >
              <Input placeholder="例如：年轻人为什么越来越不愿意结婚" allowClear maxLength={80} showCount />
            </Form.Item>
            <div className="content-factory__research-grid">
              <Form.Item name="researchEnabled" label="网页搜索" valuePropName="checked">
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
              <Form.Item name="researchDepth" label="搜索深度">
                <Segmented block options={researchDepthOptions} />
              </Form.Item>
            </div>

            <div className="content-factory__preset-strip">
              {strategyPresets.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  className={`content-factory__preset ${preset.key === activePreset.key ? 'is-active' : ''}`}
                  onClick={() => applyPreset(preset)}
                >
                  <span className="content-factory__preset-title">{preset.title}</span>
                  <span className="content-factory__preset-desc">{preset.description}</span>
                </button>
              ))}
            </div>

            <div className="content-factory__panel-toolbar">
              <Space wrap>
                <Typography.Text strong>选题灵感</Typography.Text>
                <Button icon={<FireOutlined />} onClick={() => void loadHotTopics()} loading={hotLoading}>
                  采集热点
                </Button>
                <Button
                  onClick={() => setSelectedTopicIds(hotTopics.map((topic) => topic.id))}
                  disabled={allSelected || hotTopics.length === 0}
                >
                  全选
                </Button>
                <Button onClick={() => setSelectedTopicIds([])} disabled={selectedTopicIds.length === 0}>
                  清空
                </Button>
              </Space>
              <Space size={8} wrap>
                <Tag color={activeCategoryMeta.color}>{activeCategoryMeta.label}</Tag>
                <Tag color={selectedTopicIds.length ? 'processing' : 'default'}>
                  {selectedTopicIds.length ? `已选 ${selectedTopicIds.length}` : `默认参考 ${Math.min(5, hotTopics.length)}`}
                </Tag>
              </Space>
            </div>

            <div className="content-factory__hot-list">
              {hotLoading && hotTopics.length === 0 ? (
                <Skeleton active paragraph={{ rows: 8 }} />
              ) : hotTopics.length ? (
                <List
                  dataSource={hotTopics}
                  renderItem={(topic) => (
                    <List.Item
                      className="content-factory__topic-row"
                      actions={[
                        <Button
                          key="fill"
                          type="link"
                          size="small"
                          onClick={() => fillTopicFromHot(topic)}
                        >
                          填入话题
                        </Button>,
                      ]}
                    >
                      <Checkbox
                        checked={selectedTopicIds.includes(topic.id)}
                        onChange={(event) => toggleTopic(topic.id, event.target.checked)}
                      />
                      <button
                        type="button"
                        className="content-factory__topic-main"
                        onClick={() => fillTopicFromHot(topic)}
                      >
                        <span className="content-factory__topic-title">{topic.title}</span>
                        <span className="content-factory__topic-meta">
                          {topic.sourceName} · #{topic.rank}
                          {topic.hot ? ` · ${topic.hot}` : ''}
                        </span>
                      </button>
                      {topic.url ? (
                        <a className="content-factory__topic-link" href={topic.url} target="_blank" rel="noreferrer">
                          来源
                        </a>
                      ) : null}
                    </List.Item>
                  )}
                />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无热点数据" />
              )}
            </div>

            <div className="content-factory__form-grid">
              <Form.Item name="layoutTheme" label="微信排版">
                <Segmented block options={layoutThemeOptions} />
              </Form.Item>
              <Form.Item name="imageMode" label="图片模式">
                <Segmented block options={imageModeOptions} />
              </Form.Item>
            </div>
            <div className="content-factory__form-grid content-factory__form-grid--compact">
              <Form.Item name="length" label="篇幅">
                <Select
                  options={[
                    { label: '短文', value: 'short' },
                    { label: '标准', value: 'standard' },
                    { label: '长文', value: 'long' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="coverStyle" label="封面风格">
                <Input placeholder="例如：数据感、干净、适合公众号头图" />
              </Form.Item>
            </div>

            <div className="content-factory__delivery-policy">
              <CheckCircleOutlined />
              <div>
                <Typography.Text strong>生成任务先保存为本站草稿</Typography.Text>
                <Typography.Text type="secondary">
                  质量门通过后才开放微信草稿操作；正式发布方式由后端权限决定。
                </Typography.Text>
              </div>
            </div>

            <div className="content-factory__action-row">
              <Button
                type="primary"
                size="large"
                icon={<EditOutlined />}
                onClick={() => void generateArticle()}
                loading={generating}
                disabled={!status?.aiReady || agentRunning || autopilotRunning || Boolean(pendingJob) || hotLoading || (!watchedTopic?.trim() && hotTopics.length === 0)}
              >
                生成文章草稿
              </Button>
              <Button
                size="large"
                icon={<RocketOutlined />}
                onClick={() => void runContentAgent()}
                loading={agentRunning}
                disabled={!status?.aiReady || generating || autopilotRunning || Boolean(pendingJob)}
              >
                自动选题并生成
              </Button>
            </div>
            <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
              主按钮按当前话题或热点写稿；自动选题会先筛选候选话题，再运行同一套检索、写作和质检流程。
            </Typography.Paragraph>
          </Form>
        </Card>

        <Card className="content-factory__panel" title="最近生成">
          <div className="content-factory__quality">
            {activeArticle ? (
              <>
                <div className="content-factory__quality-summary">
                  <div>
                    <Typography.Text type="secondary">后端质量门</Typography.Text>
                    <Typography.Title level={4}>
                      {quality.backendScore == null ? '--' : quality.backendScore}
                    </Typography.Title>
                  </div>
                  <div className="content-factory__quality-result">
                    <Tag color={!qualityGate ? 'default' : backendPublishable ? 'success' : 'error'}>
                      {!qualityGate ? '尚未执行' : backendPublishable ? '通过' : '阻断'}
                    </Tag>
                    <Typography.Text type="secondary">{quality.words} 字</Typography.Text>
                  </div>
                </div>
                {quality.backendScore != null ? (
                  <Progress
                    percent={quality.backendScore}
                    showInfo={false}
                    status={backendPublishable ? 'success' : 'exception'}
                  />
                ) : null}
                {!qualityGate ? (
                  <Alert
                    className="content-factory__gate-alert"
                    type="warning"
                    showIcon
                    message="没有可验证的质量门结果"
                    description="当前不会开放微信草稿操作。打开文章后运行定向改写，可重新生成审稿和质量门记录。"
                  />
                ) : quality.reason ? (
                  <Alert
                    className="content-factory__gate-alert"
                    type={backendPublishable ? 'success' : 'error'}
                    showIcon
                    message={backendPublishable ? '后端确认可进入微信草稿流程' : '后端阻止同步微信'}
                    description={quality.reason}
                  />
                ) : null}
                {quality.issues.length ? (
                  <ul className="content-factory__gate-issues">
                    {quality.issues.slice(0, 5).map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="content-factory__local-checks-heading">
                  <Typography.Text strong>编辑建议</Typography.Text>
                  <Typography.Text type="secondary">
                    {quality.checks.filter((item) => item.passed).length}/{quality.checks.length} 项 · 非后端门禁
                  </Typography.Text>
                </div>
                <Progress percent={quality.localScore} showInfo={false} strokeColor="var(--accent)" />
                <div className="content-factory__quality-checks">
                  {quality.checks.map((check) => (
                    <Badge
                      key={check.label}
                      status={check.passed ? 'success' : 'warning'}
                      text={check.passed ? check.label : `${check.label} · ${check.hint}`}
                    />
                  ))}
                </div>
              </>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择文章后查看质量门结果" />
            )}
          </div>

          <Divider className="content-factory__divider" />

          {articlesLoading && articles.length === 0 ? (
            <Skeleton active paragraph={{ rows: 8 }} />
          ) : articles.length ? (
            <List
              className="content-factory__article-list"
              dataSource={articles}
              renderItem={(article) => {
                const meta = getArticleStatusMeta(article)
                const category = article.category ? getCategoryMeta(article.category) : null
                return (
                  <List.Item
                    className="content-factory__article-row"
                    onClick={() => openArticle(article)}
                    actions={[
                      <Button
                        key="edit"
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={(event) => {
                          event.stopPropagation()
                          openArticle(article)
                        }}
                      >
                        编辑
                      </Button>,
                      <Button
                        key="delete"
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        loading={deletingArticleId === article.id}
                        onClick={(event) => deleteArticle(article, event)}
                      >
                        删除
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={
                        article.coverImageUrl ? (
                          <img className="content-factory__article-cover" src={article.coverImageUrl} alt="" />
                        ) : (
                          <span className="content-factory__article-cover content-factory__article-cover--empty">
                            <PictureOutlined />
                          </span>
                        )
                      }
                      title={
                        <Space size={8} wrap>
                          <span>{article.title}</span>
                          {category ? <Tag color={category.color}>{category.label}</Tag> : null}
                          <Tag color={meta.color}>{meta.label}</Tag>
                        </Space>
                      }
                      description={article.digest || article.errorMessage || '暂无摘要'}
                    />
                  </List.Item>
                )
              }}
            />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无文章草稿" />
          )}
        </Card>

        <Card
          className="content-factory__panel content-factory__panel--automation"
          title={activeArticle ? '本篇任务与微信记录' : '全局任务与微信记录'}
        >
          {automationLoading && !automation ? (
            <Skeleton active paragraph={{ rows: 6 }} />
          ) : automation ? (
            <Space direction="vertical" size={12} className="content-factory__automation">
              <Space wrap>
                <Tag color={automation.source === 'backend' ? 'success' : 'default'}>
                  {automation.source === 'backend' ? '后端实时记录' : '仅文章状态'}
                </Tag>
                <Tag color={getStageMeta(automation.currentStage).tone}>
                  {getStageMeta(automation.currentStage).label}
                </Tag>
              </Space>

              {automation.source === 'derived' ? (
                <Alert
                  type="warning"
                  showIcon
                  message="实时任务记录暂不可用"
                  description="下方不会伪造执行日志或重试结果。可以继续编辑本站草稿，恢复连接后刷新任务流。"
                />
              ) : null}

              <div className="content-factory__automation-block">
                <Typography.Text strong>执行日志</Typography.Text>
                <List
                  size="small"
                  dataSource={automation.logs}
                  renderItem={(item) => {
                    const meta = automationStatusMeta[item.status]
                    return (
                      <List.Item className="content-factory__automation-item">
                        <Badge status={meta.badge} text={meta.label} />
                        <div>
                          <div className="content-factory__automation-title">
                            {getStageMeta(item.stage).label} · {item.message}
                          </div>
                          <div className="content-factory__automation-meta">{formatDateTime(item.createdAt)}</div>
                          {item.detail ? <div className="content-factory__automation-detail">{item.detail}</div> : null}
                        </div>
                      </List.Item>
                    )
                  }}
                  locale={{ emptyText: '暂无日志' }}
                />
              </div>

              <div className="content-factory__automation-block">
                <Typography.Text strong>任务队列</Typography.Text>
                <List
                  size="small"
                  dataSource={automation.jobs}
                  renderItem={(job) => {
                    const meta = automationStatusMeta[job.status]
                    return (
                      <List.Item className="content-factory__automation-item">
                        <Badge status={meta.badge} text={meta.label} />
                        <div>
                          <div className="content-factory__automation-title">
                            {getStageMeta(job.stage).label} · {job.attempts}/{job.maxAttempts}
                          </div>
                          <div className="content-factory__automation-meta">
                            {job.errorMessage || job.nextRunAt ? [job.errorMessage, job.nextRunAt && `下次重试 ${formatDateTime(job.nextRunAt)}`].filter(Boolean).join(' · ') : '无待执行任务'}
                          </div>
                          {job.status === 'FAILED' ? (
                            <Button
                              size="small"
                              icon={<SyncOutlined />}
                              loading={retryingJobId === job.id}
                              disabled={Boolean(retryingJobId && retryingJobId !== job.id)}
                              onClick={() => void retryJob(job.id)}
                            >
                              重试
                            </Button>
                          ) : null}
                        </div>
                      </List.Item>
                    )
                  }}
                  locale={{ emptyText: '暂无队列任务' }}
                />
              </div>

              <div className="content-factory__automation-block">
                <Typography.Text strong>微信记录</Typography.Text>
                <List
                  size="small"
                  dataSource={automation.publishRecords}
                  renderItem={(record) => {
                    const meta = automationStatusMeta[record.status]
                    return (
                      <List.Item className="content-factory__automation-item">
                        <Badge status={meta.badge} text={meta.label} />
                        <div>
                          <div className="content-factory__automation-title">
                            {record.action === 'publish' ? '发布' : '草稿'} · {record.publishId || record.mediaId || '待生成'}
                          </div>
                          <div className="content-factory__automation-meta">
                            {record.url || record.errorMessage || formatDateTime(record.createdAt)}
                          </div>
                        </div>
                        <Space size={4}>
                          {record.mediaId ? (
                            <Tooltip title="复制 media_id">
                              <Button
                                size="small"
                                type="text"
                                icon={<CopyOutlined />}
                                onClick={() => void copyText(record.mediaId)}
                              />
                            </Tooltip>
                          ) : null}
                          {record.publishId ? (
                            <Tooltip title="复制 publish_id">
                              <Button
                                size="small"
                                type="text"
                                icon={<CopyOutlined />}
                                onClick={() => void copyText(record.publishId)}
                              />
                            </Tooltip>
                          ) : null}
                          {record.url ? (
                            <Tooltip title="打开记录">
                              <Button
                                size="small"
                                type="text"
                                icon={<LinkOutlined />}
                                href={record.url}
                                target={record.url.startsWith('http') ? '_blank' : undefined}
                              />
                            </Tooltip>
                          ) : null}
                        </Space>
                      </List.Item>
                    )
                  }}
                  locale={{ emptyText: '暂无微信记录' }}
                />
              </div>
            </Space>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无自动化信息" />
          )}
        </Card>
      </section>

      <Drawer
        title={
          activeArticle ? (
            <Space wrap>
              <span>编辑公众号文章</span>
              {activeArticleCategory ? <Tag color={activeArticleCategory.color}>{activeArticleCategory.label}</Tag> : null}
              {articleStatus ? <Tag color={articleStatus.color}>{articleStatus.label}</Tag> : null}
            </Space>
          ) : (
            '编辑公众号文章'
          )
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={820}
        rootClassName="content-factory-drawer-root"
        className="content-factory__drawer"
        extra={
          <Tag color={activeArticle?.status === 'PUBLISHED' ? 'success' : activeArticleAssetsReady ? 'processing' : 'warning'}>
            {activeArticle?.status === 'PUBLISHED' ? '已发布' : activeArticleAssetsReady ? '可同步微信' : '待完成质检'}
          </Tag>
        }
      >
        {activeArticle ? (
          <Form form={articleForm} layout="vertical" className="content-factory__article-form">
            {articleDetailLoading ? <Skeleton active paragraph={{ rows: 3 }} /> : null}

            <div className="content-factory__article-actions" aria-label="文章操作">
              <div className="content-factory__article-actions-group">
                {activeArticle.status === 'PUBLISH_SUBMITTED' ? (
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={() => void refreshActiveArticle()}
                    loading={articleDetailLoading}
                  >
                    刷新发布状态
                  </Button>
                ) : null}
                <Button
                  icon={<SaveOutlined />}
                  onClick={() => void saveArticle()}
                  loading={saving}
                  disabled={articleDetailLoading || revising || refreshingVisuals}
                >
                  保存修改
                </Button>
                <Tooltip title="按审稿意见定向改写正文，不重新选题">
                  <Button
                    icon={<EditOutlined />}
                    onClick={() => void reviseArticle()}
                    loading={revising}
                    disabled={articleDetailLoading || saving || refreshingVisuals || generating}
                  >
                    定向改写
                  </Button>
                </Tooltip>
                <Tooltip title="只重新生成封面与内联图片，并再次检查交付条件">
                  <Button
                    icon={<PictureOutlined />}
                    onClick={() => void refreshVisuals()}
                    loading={refreshingVisuals}
                    disabled={articleDetailLoading || saving || revising || generating}
                  >
                    重新配图
                  </Button>
                </Tooltip>
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(event) => deleteArticle(activeArticle, event)}
                  loading={deletingArticleId === activeArticle.id}
                >
                  删除
                </Button>
              </div>
              <div className="content-factory__article-actions-group content-factory__article-actions-group--delivery">
                <Tooltip
                  title={
                    !status?.wechatReady
                      ? '请先配置微信公众号 AppID 和 AppSecret'
                      : !qualityGate
                        ? '缺少后端质量门结果'
                        : !backendPublishable
                          ? qualityGate.reason || '后端质量门未通过'
                          : !activeArticleAssetsReady
                            ? '缺少封面或 2 张可用内联图'
                            : ''
                  }
                >
                  <Button
                    icon={<CloudUploadOutlined />}
                    onClick={() => void createWechatDraft()}
                    loading={wechatAction === 'draft'}
                    disabled={articleDetailLoading || !status?.wechatReady || !activeArticleAssetsReady || revising || refreshingVisuals}
                  >
                    {hasRealWechatDraft ? '更新微信草稿' : '同步微信草稿'}
                  </Button>
                </Tooltip>
                <Tooltip
                  title={
                    freePublishEnabled
                      ? status?.wechatReady
                        ? ''
                        : '请先配置微信公众号 AppID 和 AppSecret'
                      : '当前后端未启用微信一键发布，请在微信公众平台人工发布'
                  }
                >
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={publishWechat}
                    loading={wechatAction === 'publish'}
                    disabled={articleDetailLoading || publishBlocked}
                  >
                    {activeArticle.status === 'PUBLISH_SUBMITTED' ? '等待微信确认' : freePublishEnabled ? '提交正式发布' : '需后台发布'}
                  </Button>
                </Tooltip>
              </div>
            </div>

            {activeArticle.errorMessage ? (
              <Alert type="warning" showIcon message={activeArticle.errorMessage} />
            ) : null}

            {!qualityGate ? (
              <Alert
                type="warning"
                showIcon
                message="后端质量门尚未执行"
                description="文章可以继续编辑，但同步微信操作会保持锁定。运行定向改写可重新审稿并生成门禁结果。"
              />
            ) : !backendPublishable ? (
              <Alert
                type="error"
                showIcon
                message="后端质量门未通过"
                description={qualityGate.reason || '请处理审稿问题后重新运行定向改写。'}
              />
            ) : null}

            {isLocalWechatDraft ? (
              <Alert
                type="info"
                showIcon
                message="当前是本站本地草稿"
                description="这条记录还没有进入微信公众号草稿箱。补齐公众号配置后，可再次点击“存为微信草稿”生成真实 media_id。"
              />
            ) : null}

            {missingWechatCover ? (
              <Alert
                type="warning"
                showIcon
                message="微信草稿缺少封面素材"
                description="微信草稿箱要求封面 thumb_media_id。请给文章设置封面图，或在系统配置中填写 wechat.coverMediaId。"
              />
            ) : null}

            {missingInlineImages ? (
              <Alert
                type="warning"
                showIcon
                message="内联图片未达到发布标准"
                description={`当前可用内联图 ${readyInlineImages.length} 张，失败 ${failedInlineImages.length} 张。发布就绪文章需要 2-3 张不同位置的可用内联图。`}
              />
            ) : null}

            {riskCount > 0 ? (
              <Alert
                type="warning"
                showIcon
                message="已检测到审稿风险"
                description={`当前文章包含 ${riskCount} 条风险提示，建议先人工核对再入微信草稿。`}
              />
            ) : null}

            <div className="content-factory__automation-summary">
              <Space wrap>
                <Tag color={automation?.source === 'backend' ? 'success' : 'default'}>
                  {automation?.source === 'backend' ? '后端实时记录' : '仅文章状态'}
                </Tag>
                <Tag color={getStageMeta(automation?.currentStage).tone}>
                  {getStageMeta(automation?.currentStage).label}
                </Tag>
              </Space>
              <Typography.Text type="secondary">
                {automation?.logs.length || 0} 条日志 · {automation?.jobs.length || 0} 个任务 · {automation?.publishRecords.length || 0} 条记录
              </Typography.Text>
            </div>

            <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
              <Input maxLength={96} showCount />
            </Form.Item>
            <Form.Item name="category" label="内容栏目">
              <AutoComplete
                options={categoryOptions}
                placeholder="例如：AI 工具、创业观察、读书笔记"
                filterOption={(inputValue, option) =>
                  Boolean(option?.label?.toString().includes(inputValue) || option?.value?.toString().includes(inputValue))
                }
              />
            </Form.Item>
            <Form.Item name="digest" label="摘要">
              <Input.TextArea rows={2} maxLength={120} showCount />
            </Form.Item>
            <Form.Item name="coverImageUrl" label="封面地址">
              <Input placeholder="https:// 或 /api/v1/content/assets/..." />
            </Form.Item>

            {(watchedCoverImage || activeArticle.coverImageUrl) ? (
              <div className="content-factory__cover-preview">
                <Image src={watchedCoverImage || activeArticle.coverImageUrl || ''} alt="文章封面" />
              </div>
            ) : null}

            <div className="content-factory__visual-assets">
              <div className="content-factory__visual-assets-header">
                <Typography.Text strong>内联图片资产</Typography.Text>
                <Space size={6} wrap>
                  <Tag color={inlineImagesReady ? 'success' : 'warning'}>
                    {readyInlineImages.length}/2 可用
                  </Tag>
                  {failedInlineImages.length ? <Tag color="error">{failedInlineImages.length} 失败</Tag> : null}
                </Space>
              </div>
              {inlineImages.length ? (
                <List
                  size="small"
                  dataSource={inlineImages}
                  renderItem={(image) => (
                    <List.Item className="content-factory__visual-asset">
                      <div className="content-factory__visual-thumb">
                        {image.sourceUrl || image.wechatUrl ? (
                          <img src={image.sourceUrl || image.wechatUrl || ''} alt={image.alt || image.sectionTitle} />
                        ) : (
                          <PictureOutlined />
                        )}
                      </div>
                      <div className="content-factory__visual-body">
                        <Space size={6} wrap>
                          <Tag color={image.status === 'READY' ? 'success' : 'error'}>{image.status}</Tag>
                          <Tag color={image.sourceType === 'ai' ? 'purple' : 'blue'}>
                            {image.sourceType === 'ai' ? 'AI' : 'Open image'}
                          </Tag>
                          {image.wechatUrl ? <Tag color="geekblue">WeChat URL</Tag> : null}
                        </Space>
                        <Typography.Text strong>{image.sectionTitle || image.sectionKey || image.slotId}</Typography.Text>
                        <Typography.Text type="secondary">
                          {[image.alt, image.author, image.license].filter(Boolean).join(' · ') || '暂无描述'}
                        </Typography.Text>
                        {image.failureReason ? (
                          <Typography.Text type="danger">{image.failureReason}</Typography.Text>
                        ) : null}
                        {image.attribution ? (
                          <Typography.Text type="secondary">{image.attribution}</Typography.Text>
                        ) : null}
                      </div>
                    </List.Item>
                  )}
                />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无内联图片资产" />
              )}
            </div>

            <Tabs
              items={[
                {
                  key: 'html',
                  label: '正文 HTML',
                  children: (
                    <Form.Item
                      name="contentHtml"
                      rules={[{ required: true, message: '请输入正文 HTML' }]}
                    >
                      <Input.TextArea className="content-factory__editor" />
                    </Form.Item>
                  ),
                },
                {
                  key: 'preview',
                  label: '预览',
                  children: (
                    <article
                      className={[
                        'content-factory__preview',
                        'content-factory__preview--phone',
                        activeArticle.layoutTheme
                          ? `content-factory__preview--${activeArticle.layoutTheme}`
                          : 'content-factory__preview--clean',
                      ].join(' ')}
                      data-layout={activeArticle.layoutTheme || 'clean'}
                      dangerouslySetInnerHTML={{ __html: sanitizedPreviewHtml }}
                    />
                  ),
                },
                {
                  key: 'markdown',
                  label: 'Markdown',
                  children: (
                    <Form.Item name="contentMarkdown">
                      <Input.TextArea className="content-factory__editor" />
                    </Form.Item>
                  ),
                },
                {
                  key: 'automation',
                  label: '任务流',
                  children: automation ? (
                    <div className="content-factory__drawer-automation">
                      <List
                        size="small"
                        dataSource={automation.logs}
                        renderItem={(item) => (
                          <List.Item className="content-factory__automation-item">
                            <Badge status={automationStatusMeta[item.status].badge} text={item.message} />
                            <span className="content-factory__automation-meta">
                              {getStageMeta(item.stage).label} · {formatDateTime(item.createdAt)}
                            </span>
                          </List.Item>
                        )}
                      />
                    </div>
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务流信息" />
                  ),
                },
              ]}
            />
          </Form>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择一篇文章" />
        )}
      </Drawer>
    </div>
  )
}

function CapabilityItem({
  icon,
  title,
  ready,
  readyText,
  blockedText,
  neutralWhenBlocked = false,
}: {
  icon: ReactNode
  title: string
  ready?: boolean
  readyText: string
  blockedText: string
  neutralWhenBlocked?: boolean
}) {
  const state = ready == null ? 'unknown' : ready ? 'ready' : neutralWhenBlocked ? 'neutral' : 'blocked'
  return (
    <div className={`content-factory__capability is-${state}`}>
      <span className="content-factory__capability-icon">{icon}</span>
      <div>
        <strong>{title}</strong>
        <span>
          {ready == null ? '状态未知' : ready ? readyText : blockedText}
        </span>
      </div>
      <span className="content-factory__capability-mark" aria-hidden="true">
        {ready == null ? <ReloadOutlined /> : ready ? <CheckCircleOutlined /> : neutralWhenBlocked ? <ClockCircleOutlined /> : <WarningOutlined />}
      </span>
    </div>
  )
}
