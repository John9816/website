import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App as AntApp,
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
  CloudUploadOutlined,
  DeleteOutlined,
  EditOutlined,
  FireOutlined,
  PictureOutlined,
  ReloadOutlined,
  RocketOutlined,
  SaveOutlined,
  SendOutlined,
} from '@ant-design/icons'
import {
  adminCreateWechatDraft,
  adminDeleteContentArticle,
  adminGenerateContentArticle,
  adminGetContentAutomation,
  adminGetContentStatus,
  adminGetHotTopics,
  adminListContentArticles,
  adminPublishWechatArticle,
  adminRetryContentAutomationJob,
  adminUpdateContentArticle,
} from '../api/admin'
import type {
  ContentAutomationJob,
  ContentAutomationLog,
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
} from '../types'
import '../styles/admin-content-factory.css'

type GenerateValues = {
  category: ContentArticleCategory
  topic?: string
  layoutTheme: ContentArticleLayoutTheme
  imageMode: ContentArticleImageMode
  researchEnabled: boolean
  researchDepth: ContentArticleResearchDepth
  autoWechatDraft: boolean
  autoPublish: boolean
  angle?: string
  audience?: string
  tone?: string
  length: ContentArticleLength
  generateCover: boolean
  coverStyle?: string
}

type ArticleFormValues = {
  title: string
  digest?: string | null
  contentHtml: string
  contentMarkdown?: string | null
  coverImageUrl?: string | null
}

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
  PUBLISHED: { label: '已发布', color: 'success' },
}

const categoryMeta: Record<
  ContentArticleCategory,
  {
    label: string
    color: string
    angle: string
    audience: string
    tone: string
    coverStyle: string
    note: string
  }
> = {
  emotion_psychology: {
    label: '情感心理',
    color: 'magenta',
    angle: '从真实关系、情绪需求和自我成长切入，给读者可复盘、可练习的理解框架',
    audience: '正在处理亲密关系、家庭沟通、职场情绪和自我成长的公众号读者',
    tone: '温暖、清醒、克制，不鸡汤、不诊断',
    coverStyle: '柔和人文，情绪曲线，温暖但不甜腻',
    note: '适合关系沟通、情绪成本、自我成长和边界感选题。',
  },
  history_philosophy: {
    label: '历史哲学',
    color: 'gold',
    angle: '从历史人物、事件脉络或思想命题切入，把旧问题讲成今天仍然有用的判断力',
    audience: '喜欢历史故事、思想辨析和长期主义思考的公众号读者',
    tone: '沉稳、有证据、有思辨感，避免故作玄虚',
    coverStyle: '纸本文献，时间轴，克制高级的历史感',
    note: '适合人物命运、时代结构、思想命题和长期判断。',
  },
  society_livelihood: {
    label: '社会民生',
    color: 'cyan',
    angle: '从公共议题背后的生活成本、教育就业、城市生活和普通人处境切入',
    audience: '关心现实生活、公共议题和社会变化的公众号读者',
    tone: '客观、克制、有温度，不煽动',
    coverStyle: '城市街景，民生数据，清晰可信的新闻杂志感',
    note: '适合就业教育、消费变化、城市生活和公共议题。',
  },
}

const layoutThemeOptions: Array<{ label: string; value: ContentArticleLayoutTheme }> = [
  { label: '清爽', value: 'clean' },
  { label: '温暖', value: 'warm' },
  { label: '杂志', value: 'magazine' },
]

const imageModeOptions: Array<{ label: string; value: ContentArticleImageMode }> = [
  { label: '生成封面', value: 'generate' },
  { label: '抓取图片', value: 'fetch' },
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
    title: '热点快反',
    description: '抓取多源热榜，快速生成观点清晰、适合当天发布的短中篇。',
    values: {
      researchDepth: 'quick',
      length: 'short',
      layoutTheme: 'clean',
      imageMode: 'fetch',
      tone: '直接、清醒、信息密度高，避免标题党和情绪煽动',
    },
  },
  {
    key: 'evidence_feature',
    title: '深度长文',
    description: '强调证据链、结构化论证和可复盘结论，适合周更主文。',
    values: {
      researchDepth: 'deep',
      length: 'long',
      layoutTheme: 'magazine',
      imageMode: 'generate',
      tone: '克制、扎实、有判断力，引用事实后再给观点',
    },
  },
  {
    key: 'wechat_safe',
    title: '稳妥草稿',
    description: '参考开源发布工具的保守策略：先入草稿箱，人工复核后再发布。',
    values: {
      researchDepth: 'standard',
      length: 'standard',
      layoutTheme: 'warm',
      autoWechatDraft: true,
      autoPublish: false,
      tone: '自然、有温度、有边界感，不夸大、不制造对立',
    },
  },
]

const pipelineSteps = [
  { title: '选题', description: '热榜 / 自定义话题' },
  { title: '检索', description: '资料与证据链' },
  { title: '生成', description: '正文 / 摘要 / 封面' },
  { title: '审稿', description: '标题、事实、风险' },
  { title: '入草稿', description: '素材上传与草稿箱' },
  { title: '发布', description: '人工确认或自动提交' },
]

const stageMeta: Record<ContentAutomationStage, { label: string; tone: string }> = {
  topic: { label: '选题', tone: 'blue' },
  research: { label: '检索', tone: 'cyan' },
  generate: { label: '生成', tone: 'purple' },
  review: { label: '审稿', tone: 'gold' },
  wechat_draft: { label: '入草稿', tone: 'geekblue' },
  publish: { label: '发布', tone: 'green' },
}

const automationStatusMeta: Record<ContentAutomationStatus, { label: string; badge: 'default' | 'processing' | 'success' | 'error' | 'warning' }> = {
  PENDING: { label: '等待中', badge: 'default' },
  RUNNING: { label: '执行中', badge: 'processing' },
  SUCCESS: { label: '成功', badge: 'success' },
  FAILED: { label: '失败', badge: 'error' },
  SKIPPED: { label: '跳过', badge: 'warning' },
}

const wechatGuardrails = [
  '封面建议使用 2.35:1 比例，避免重要文字贴边。',
  '外链、二维码、诱导分享等内容在发布前需要人工复核。',
  '自动发布前先检查标题、摘要、封面、正文首屏和图片可访问性。',
  '微信接口受 IP 白名单、access_token、素材 media_id 等配置影响，失败后优先保留本站草稿。',
]

const defaultGenerateValues: GenerateValues = {
  category: 'emotion_psychology',
  topic: '',
  layoutTheme: 'clean',
  imageMode: 'generate',
  researchEnabled: true,
  researchDepth: 'standard',
  autoWechatDraft: false,
  autoPublish: false,
  angle: categoryMeta.emotion_psychology.angle,
  audience: categoryMeta.emotion_psychology.audience,
  tone: categoryMeta.emotion_psychology.tone,
  length: 'standard',
  generateCover: true,
  coverStyle: categoryMeta.emotion_psychology.coverStyle,
}

function stripHtml(html?: string | null) {
  return (html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

function getArticleQuality(article: ContentArticle | null) {
  if (!article) {
    return {
      score: 0,
      words: 0,
      checks: [] as Array<{ label: string; passed: boolean; hint: string }>,
    }
  }

  const text = stripHtml(article.contentHtml || article.contentMarkdown)
  const words = text.length
  const checks = [
    { label: '标题完整', passed: article.title.trim().length >= 8, hint: '标题建议 8-32 字，别太短也别塞满关键词。' },
    { label: '摘要可用', passed: Boolean(article.digest && article.digest.trim().length >= 24), hint: '摘要会影响分享卡片和草稿可读性。' },
    { label: '正文充足', passed: words >= 1200, hint: '标准公众号正文建议至少 1200 字。' },
    { label: '封面就绪', passed: Boolean(article.coverImageUrl), hint: '没有封面时可先存草稿，发布前补齐。' },
    { label: '选题来源', passed: article.topics.length > 0, hint: '保留热榜来源方便回看选题依据。' },
    { label: '风险较低', passed: article.riskTips.length === 0, hint: '存在风险提示时建议人工审稿。' },
  ]
  const score = Math.round((checks.filter((item) => item.passed).length / checks.length) * 100)

  return { score, words, checks }
}

function isAutomationView(value: unknown): value is ContentAutomationView {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ContentAutomationView>
  return Array.isArray(candidate.logs) || Array.isArray(candidate.jobs) || Array.isArray(candidate.publishRecords)
}

function nowIso() {
  return new Date().toISOString()
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

  const createdAt = article.createdAt || nowIso()
  const updatedAt = article.updatedAt || createdAt
  const logs: ContentAutomationLog[] = [
    {
      id: `${article.id}-topic`,
      stage: 'topic',
      status: 'SUCCESS',
      message: article.topics.length ? `已关联 ${article.topics.length} 个选题来源` : '使用自定义话题生成',
      createdAt,
    },
    {
      id: `${article.id}-generate`,
      stage: 'generate',
      status: article.errorMessage ? 'FAILED' : 'SUCCESS',
      message: article.errorMessage || '正文、摘要和封面信息已生成',
      createdAt: updatedAt,
    },
  ]

  if (article.status === 'WECHAT_DRAFT' || article.status === 'PUBLISHED') {
    logs.push({
      id: `${article.id}-draft`,
      stage: 'wechat_draft',
      status: 'SUCCESS',
      message: article.wechatMediaId ? `微信草稿已创建：${article.wechatMediaId}` : '微信草稿已创建',
      createdAt: updatedAt,
    })
  }

  if (article.status === 'PUBLISHED') {
    logs.push({
      id: `${article.id}-publish`,
      stage: 'publish',
      status: 'SUCCESS',
      message: article.wechatUrl ? '微信发布已完成' : '微信发布已提交',
      createdAt: updatedAt,
    })
  }

  const jobs: ContentAutomationJob[] = [
    {
      id: `${article.id}-review`,
      stage: 'review',
      status: article.riskTips.length ? 'PENDING' : 'SUCCESS',
      attempts: 1,
      maxAttempts: 1,
      errorMessage: article.riskTips.length ? article.riskTips.join('；') : null,
      createdAt,
      updatedAt,
    },
  ]

  const publishRecords = article.wechatMediaId || article.wechatPublishId || article.wechatUrl
    ? [
        {
          id: `${article.id}-wechat`,
          action: article.status === 'PUBLISHED' ? 'publish' as const : 'draft' as const,
          status: article.errorMessage ? 'FAILED' as const : 'SUCCESS' as const,
          mediaId: article.wechatMediaId || null,
          publishId: article.wechatPublishId || null,
          url: article.wechatUrl || null,
          errorMessage: article.errorMessage || null,
          createdAt: updatedAt,
        },
      ]
    : []

  return {
    source: 'derived',
    currentStage: inferStage(article),
    logs,
    jobs,
    publishRecords,
  }
}

function inferStage(article: ContentArticle): ContentAutomationStage {
  if (article.status === 'PUBLISHED') return 'publish'
  if (article.status === 'WECHAT_DRAFT') return 'wechat_draft'
  if (article.riskTips.length) return 'review'
  return 'generate'
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

export default function AdminContentFactory() {
  const { message, modal } = AntApp.useApp()
  const [generateForm] = Form.useForm<GenerateValues>()
  const [articleForm] = Form.useForm<ArticleFormValues>()
  const [status, setStatus] = useState<ContentFactoryStatus | null>(null)
  const [hotTopics, setHotTopics] = useState<ContentHotTopic[]>([])
  const [articles, setArticles] = useState<ContentArticle[]>([])
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([])
  const [activeCategory, setActiveCategory] = useState<ContentArticleCategory>(defaultGenerateValues.category)
  const [activeArticle, setActiveArticle] = useState<ContentArticle | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [hotLoading, setHotLoading] = useState(false)
  const [articlesLoading, setArticlesLoading] = useState(false)
  const [automationLoading, setAutomationLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingArticleId, setDeletingArticleId] = useState<number | null>(null)
  const [wechatAction, setWechatAction] = useState<'draft' | 'publish' | null>(null)
  const [activePresetKey, setActivePresetKey] = useState(strategyPresets[0].key)
  const [automation, setAutomation] = useState<NormalizedAutomation | null>(null)

  const watchedHtml = Form.useWatch('contentHtml', articleForm)
  const watchedCoverImage = Form.useWatch('coverImageUrl', articleForm)
  const watchedAutoPublish = Form.useWatch('autoPublish', generateForm)
  const watchedTopic = Form.useWatch('topic', generateForm)

  const selectedTopics = useMemo(() => {
    const selected = hotTopics.filter((topic) => selectedTopicIds.includes(topic.id))
    return selected.length ? selected : hotTopics.slice(0, 5)
  }, [hotTopics, selectedTopicIds])

  const activePreset = useMemo(
    () => strategyPresets.find((preset) => preset.key === activePresetKey) || strategyPresets[0],
    [activePresetKey],
  )

  const quality = useMemo(() => getArticleQuality(activeArticle), [activeArticle])
  const progressPercent = activeArticle
    ? activeArticle.status === 'PUBLISHED'
      ? 100
      : activeArticle.status === 'WECHAT_DRAFT'
        ? 80
        : 56
    : 18
  const riskCount = activeArticle?.riskTips.length ?? 0
  const publishBlocked = !status?.wechatReady || generating || saving || Boolean(wechatAction)

  const loadStatus = async () => {
    setStatusLoading(true)
    try {
      setStatus(await adminGetContentStatus())
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setStatusLoading(false)
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
    setAutomationLoading(true)
    try {
      const data = await adminGetContentAutomation(articleId)
      setAutomation(data ? { ...data, source: 'backend' } : null)
    } catch {
      setAutomation(activeArticle ? deriveAutomation(activeArticle) : null)
    } finally {
      setAutomationLoading(false)
    }
  }

  const retryJob = async (jobId: string) => {
    try {
      const data = await adminRetryContentAutomationJob(jobId)
      setAutomation({ ...data, source: 'backend' })
      message.success('已重新进入队列')
    } catch (error) {
      message.error((error as Error).message)
    }
  }

  useEffect(() => {
    generateForm.setFieldsValue(defaultGenerateValues)
    void loadStatus()
    void loadHotTopics(defaultGenerateValues.category)
    void loadArticles()
    void loadAutomation()
  }, [])

  useEffect(() => {
    if (!activeArticle) return
    articleForm.setFieldsValue({
      title: activeArticle.title,
      digest: activeArticle.digest || '',
      contentHtml: activeArticle.contentHtml,
      contentMarkdown: activeArticle.contentMarkdown || '',
      coverImageUrl: activeArticle.coverImageUrl || '',
    })
  }, [activeArticle, articleForm])

  useEffect(() => {
    if (!activeArticle) {
      setAutomation(null)
      return
    }
    void loadAutomation(activeArticle.id)
  }, [activeArticle?.id])

  const upsertArticle = (article: ContentArticle) => {
    setArticles((previous) => [article, ...previous.filter((item) => item.id !== article.id)])
    setActiveArticle(article)
    setAutomation(deriveAutomation(article))
  }

  const toggleTopic = (topicId: string, checked: boolean) => {
    setSelectedTopicIds((previous) =>
      checked ? [...new Set([...previous, topicId])] : previous.filter((id) => id !== topicId),
    )
  }

  const changeCategory = (category: ContentArticleCategory) => {
    const meta = categoryMeta[category]
    setActiveCategory(category)
    setSelectedTopicIds([])
    generateForm.setFieldsValue({
      category,
      angle: meta.angle,
      audience: meta.audience,
      tone: meta.tone,
      coverStyle: meta.coverStyle,
    })
    void loadHotTopics(category)
  }

  const applyPreset = (preset: StrategyPreset) => {
    setActivePresetKey(preset.key)
    generateForm.setFieldsValue({
      ...preset.values,
      category: activeCategory,
    })
    if (preset.values.autoPublish) {
      generateForm.setFieldValue('autoWechatDraft', false)
    }
    if (preset.values.autoWechatDraft) {
      generateForm.setFieldValue('autoPublish', false)
    }
  }

  const generateArticle = async () => {
    const values = await generateForm.validateFields()
    const topic = values.topic?.trim()
    const payload: ContentArticleGeneratePayload = {
      ...values,
      topic: topic || undefined,
      category: activeCategory,
      generateCover: values.imageMode !== 'none',
      topics: selectedTopics,
    }

    setGenerating(true)
    try {
      const article = await adminGenerateContentArticle(payload)
      upsertArticle(article)
      setDrawerOpen(true)
      message.success(values.autoPublish ? '文章已生成，已提交自动发布流程' : values.autoWechatDraft ? '文章已生成，已提交微信草稿流程' : '文章已生成')
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const openArticle = (article: ContentArticle) => {
    setActiveArticle(article)
    setDrawerOpen(true)
  }

  const saveArticle = async () => {
    if (!activeArticle) return
    const values = await articleForm.validateFields()
    setSaving(true)
    try {
      const article = await adminUpdateContentArticle(activeArticle.id, {
        title: values.title,
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

  const createWechatDraft = async () => {
    if (!activeArticle) return
    setWechatAction('draft')
    try {
      const result = await adminCreateWechatDraft(activeArticle.id)
      upsertArticle(result.article)
      message.success('已创建微信草稿')
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      setWechatAction(null)
    }
  }

  const publishWechat = () => {
    if (!activeArticle) return
    modal.confirm({
      title: '发布到微信公众号',
      content: '确认后会创建微信草稿并提交发布，请先确认标题、封面和正文已经复核。',
      okText: '确认发布',
      cancelText: '取消',
      okButtonProps: { icon: <SendOutlined /> },
      onOk: async () => {
        setWechatAction('publish')
        try {
          const result = await adminPublishWechatArticle(activeArticle.id)
          upsertArticle(result.article)
          message.success('已提交微信发布')
        } catch (error) {
          message.error((error as Error).message)
        } finally {
          setWechatAction(null)
        }
      },
    })
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
  const articleStatus = activeArticle ? statusMeta[activeArticle.status] : null
  const activeArticleCategory = activeArticle?.category ? categoryMeta[activeArticle.category] : null

  return (
    <div className="content-factory">
      <section className="content-factory__header">
        <div>
          <Typography.Title level={3}>内容工厂</Typography.Title>
          <Typography.Paragraph type="secondary">
            参考公众号自动化开源项目的常见流程，把选题、检索、审稿、草稿和发布放到同一条链路里。
          </Typography.Paragraph>
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
        <div className="content-factory__pipeline-main">
          <Steps
            current={activeArticle ? Math.min(5, activeArticle.status === 'PUBLISHED' ? 5 : activeArticle.status === 'WECHAT_DRAFT' ? 4 : 3) : 0}
            items={pipelineSteps}
            size="small"
          />
        </div>
        <div className="content-factory__pipeline-score">
          <Typography.Text type="secondary">自动化进度</Typography.Text>
          <Progress percent={progressPercent} size="small" />
        </div>
      </section>

      <section className="content-factory__status" aria-label="内容工厂能力状态">
        {statusLoading && !status ? (
          <Skeleton active paragraph={{ rows: 1 }} />
        ) : (
          <>
            <StatusPill ready={Boolean(status?.aiReady)} label="文章模型" />
            <StatusPill ready={Boolean(status?.imageReady)} label="封面模型" />
            <StatusPill ready={Boolean(status?.wechatReady)} label="微信公众号" />
            {status?.configs.map((item) => (
              <Tag key={item.key} color={item.ready ? 'success' : 'warning'} className="content-factory__config-tag">
                {item.label}
              </Tag>
            ))}
          </>
        )}
      </section>

      {status && !status.wechatReady ? (
        <Alert
          type="warning"
          showIcon
          message="微信公众号未配置"
          description="在系统配置中补齐 wechat.appId、wechat.appSecret；没有封面时可先配置 wechat.coverMediaId。自动发布会被锁定，但本站草稿仍可继续生成。"
        />
      ) : null}

      <section className="content-factory__workspace">
        <Card className="content-factory__panel" title="话题研究与生成">
          <div className="content-factory__category-strip">
            <div className="content-factory__category-control">
              <Typography.Text strong>内容栏目</Typography.Text>
              <Segmented
                value={activeCategory}
                options={(Object.keys(categoryMeta) as ContentArticleCategory[]).map((key) => ({
                  label: categoryMeta[key].label,
                  value: key,
                }))}
                onChange={(value) => changeCategory(value as ContentArticleCategory)}
              />
            </div>
            <Typography.Text type="secondary">{categoryMeta[activeCategory].note}</Typography.Text>
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
                <Tag color={categoryMeta[activeCategory].color}>{categoryMeta[activeCategory].label}</Tag>
                <Tag color={selectedTopicIds.length ? 'processing' : 'default'}>
                  已选 {selectedTopicIds.length || Math.min(5, hotTopics.length)}
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
                    <List.Item className="content-factory__topic-row">
                      <Checkbox
                        checked={selectedTopicIds.includes(topic.id)}
                        onChange={(event) => toggleTopic(topic.id, event.target.checked)}
                      />
                      <button
                        type="button"
                        className="content-factory__topic-main"
                        onClick={() => toggleTopic(topic.id, !selectedTopicIds.includes(topic.id))}
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
            <Form.Item name="angle" label="切入角度">
              <Input placeholder="例如：从普通人的机会和风险切入" />
            </Form.Item>
            <div className="content-factory__form-grid">
              <Form.Item name="audience" label="目标读者">
                <Input placeholder="例如：公众号运营者、AI 工具使用者" />
              </Form.Item>
              <Form.Item name="tone" label="语气">
                <Input placeholder="例如：清醒、有洞察、有行动感" />
              </Form.Item>
            </div>
            <div className="content-factory__form-grid content-factory__form-grid--three">
              <Form.Item name="length" label="篇幅">
                <Select
                  options={[
                    { label: '短文', value: 'short' },
                    { label: '标准', value: 'standard' },
                    { label: '长文', value: 'long' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="autoWechatDraft" label="生成后存草稿" valuePropName="checked">
                <Switch
                  checkedChildren="开启"
                  unCheckedChildren="关闭"
                  disabled={Boolean(watchedAutoPublish) || !status?.wechatReady}
                />
              </Form.Item>
              <Form.Item name="autoPublish" label="生成后发布" valuePropName="checked">
                <Switch
                  checkedChildren="开启"
                  unCheckedChildren="关闭"
                  disabled={!status?.wechatReady}
                  onChange={(checked) => {
                    if (checked) generateForm.setFieldValue('autoWechatDraft', false)
                  }}
                />
              </Form.Item>
            </div>
            <Form.Item name="coverStyle" label="封面风格">
              <Input placeholder="例如：数据感、干净、适合公众号头图" />
            </Form.Item>

            <div className="content-factory__guardrail">
              <Typography.Text strong>发布前守护</Typography.Text>
              <ul className="content-factory__guardrail-list">
                {wechatGuardrails.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <Button
              type="primary"
              size="large"
              block
              icon={<RocketOutlined />}
              onClick={() => void generateArticle()}
              loading={generating}
              disabled={hotLoading || (!watchedTopic?.trim() && hotTopics.length === 0)}
            >
              搜索并生成公众号正文
            </Button>
          </Form>
        </Card>

        <Card className="content-factory__panel" title="最近生成">
          <div className="content-factory__quality">
            <div className="content-factory__quality-summary">
              <Typography.Text type="secondary">文章质量评分</Typography.Text>
              <Typography.Title level={4}>{quality.score}</Typography.Title>
              <Typography.Text type="secondary">{quality.words} 字</Typography.Text>
            </div>
            <Progress percent={quality.score} showInfo={false} />
            <div className="content-factory__quality-checks">
              {quality.checks.map((check) => (
                <Badge
                  key={check.label}
                  status={check.passed ? 'success' : 'warning'}
                  text={check.passed ? check.label : `${check.label} · ${check.hint}`}
                />
              ))}
            </div>
          </div>

          <Divider className="content-factory__divider" />

          {articlesLoading && articles.length === 0 ? (
            <Skeleton active paragraph={{ rows: 8 }} />
          ) : articles.length ? (
            <List
              className="content-factory__article-list"
              dataSource={articles}
              renderItem={(article) => {
                const meta = statusMeta[article.status]
                const category = article.category ? categoryMeta[article.category] : null
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

        <Card className="content-factory__panel" title="任务流与发布记录">
          {automationLoading && !automation ? (
            <Skeleton active paragraph={{ rows: 6 }} />
          ) : automation ? (
            <Space direction="vertical" size={12} className="content-factory__automation">
              <Space wrap>
                <Tag color={automation.source === 'backend' ? 'success' : 'default'}>
                  {automation.source === 'backend' ? '后端同步' : '前端推导'}
                </Tag>
                <Tag color={automation.currentStage ? stageMeta[automation.currentStage].tone : 'default'}>
                  {automation.currentStage ? stageMeta[automation.currentStage].label : '未开始'}
                </Tag>
              </Space>

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
                            {stageMeta[item.stage].label} · {item.message}
                          </div>
                          <div className="content-factory__automation-meta">{formatDateTime(item.createdAt)}</div>
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
                            {stageMeta[job.stage].label} · {job.attempts}/{job.maxAttempts}
                          </div>
                          <div className="content-factory__automation-meta">
                            {job.errorMessage || job.nextRunAt ? [job.errorMessage, job.nextRunAt && `下次重试 ${formatDateTime(job.nextRunAt)}`].filter(Boolean).join(' · ') : '无待执行任务'}
                          </div>
                          {job.status === 'FAILED' ? (
                            <Button size="small" onClick={() => void retryJob(job.id)}>
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
        className="content-factory__drawer"
        extra={
          <Space wrap>
            <Tag color={publishBlocked ? 'warning' : 'success'}>
              {publishBlocked ? '发布待检查' : '发布就绪'}
            </Tag>
            <Button icon={<SaveOutlined />} onClick={() => void saveArticle()} loading={saving} disabled={!activeArticle}>
              保存
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={(event) => activeArticle && deleteArticle(activeArticle, event)}
              loading={activeArticle ? deletingArticleId === activeArticle.id : false}
              disabled={!activeArticle}
            >
              删除
            </Button>
            <Tooltip title={status?.wechatReady ? '' : '请先配置微信公众号 AppID 和 AppSecret'}>
              <Button
                icon={<CloudUploadOutlined />}
                onClick={() => void createWechatDraft()}
                loading={wechatAction === 'draft'}
                disabled={!activeArticle || !status?.wechatReady}
              >
                存为微信草稿
              </Button>
            </Tooltip>
            <Tooltip title={status?.wechatReady ? '' : '请先配置微信公众号 AppID 和 AppSecret'}>
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={publishWechat}
                loading={wechatAction === 'publish'}
                disabled={!activeArticle || !status?.wechatReady}
              >
                一键发布
              </Button>
            </Tooltip>
          </Space>
        }
      >
        {activeArticle ? (
          <Form form={articleForm} layout="vertical" className="content-factory__article-form">
            {activeArticle.errorMessage ? (
              <Alert type="warning" showIcon message={activeArticle.errorMessage} />
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
                  {automation?.source === 'backend' ? '任务流已接入' : '本地推导'}
                </Tag>
                <Tag color={automation?.currentStage ? stageMeta[automation.currentStage].tone : 'default'}>
                  {automation?.currentStage ? stageMeta[automation.currentStage].label : '未开始'}
                </Tag>
              </Space>
              <Typography.Text type="secondary">
                {automation?.logs.length || 0} 条日志 · {automation?.jobs.length || 0} 个任务 · {automation?.publishRecords.length || 0} 条记录
              </Typography.Text>
            </div>

            <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
              <Input maxLength={96} showCount />
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
                      className="content-factory__preview"
                      dangerouslySetInnerHTML={{ __html: watchedHtml || activeArticle.contentHtml }}
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
                              {stageMeta[item.stage].label} · {formatDateTime(item.createdAt)}
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

function StatusPill({ ready, label }: { ready: boolean; label: string }) {
  return (
    <span className={`content-factory__status-pill ${ready ? 'is-ready' : 'is-missing'}`}>
      {ready ? <CheckCircleOutlined /> : <ReloadOutlined />}
      {label}
    </span>
  )
}
