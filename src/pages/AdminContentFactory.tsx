import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Checkbox,
  Drawer,
  Empty,
  Form,
  Image,
  Input,
  List,
  Segmented,
  Select,
  Skeleton,
  Space,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  CheckCircleOutlined,
  CloudUploadOutlined,
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
  adminGenerateContentArticle,
  adminGetContentStatus,
  adminGetHotTopics,
  adminListContentArticles,
  adminPublishWechatArticle,
  adminUpdateContentArticle,
} from '../api/admin'
import type {
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
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [wechatAction, setWechatAction] = useState<'draft' | 'publish' | null>(null)

  const watchedHtml = Form.useWatch('contentHtml', articleForm)
  const watchedCoverImage = Form.useWatch('coverImageUrl', articleForm)
  const watchedAutoPublish = Form.useWatch('autoPublish', generateForm)
  const watchedTopic = Form.useWatch('topic', generateForm)

  const selectedTopics = useMemo(() => {
    const selected = hotTopics.filter((topic) => selectedTopicIds.includes(topic.id))
    return selected.length ? selected : hotTopics.slice(0, 5)
  }, [hotTopics, selectedTopicIds])

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

  useEffect(() => {
    generateForm.setFieldsValue(defaultGenerateValues)
    void loadStatus()
    void loadHotTopics(defaultGenerateValues.category)
    void loadArticles()
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

  const upsertArticle = (article: ContentArticle) => {
    setArticles((previous) => [article, ...previous.filter((item) => item.id !== article.id)])
    setActiveArticle(article)
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

  const allSelected = hotTopics.length > 0 && selectedTopicIds.length === hotTopics.length
  const articleStatus = activeArticle ? statusMeta[activeArticle.status] : null
  const activeArticleCategory = activeArticle?.category ? categoryMeta[activeArticle.category] : null

  return (
    <div className="content-factory">
      <section className="content-factory__header">
        <div>
          <Typography.Title level={3}>内容工厂</Typography.Title>
          <Typography.Paragraph type="secondary">
            输入话题或选择热点，联网搜索资料后生成可直接编辑和推送的公众号正文。
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
          description="在系统配置中补齐 wechat.appId、wechat.appSecret；没有封面时可先配置 wechat.coverMediaId。"
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
            <Button icon={<SaveOutlined />} onClick={() => void saveArticle()} loading={saving} disabled={!activeArticle}>
              保存
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
