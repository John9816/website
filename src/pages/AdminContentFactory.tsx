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
  ContentArticleGeneratePayload,
  ContentArticleLength,
  ContentArticleStatus,
  ContentFactoryStatus,
  ContentHotTopic,
} from '../types'
import '../styles/admin-content-factory.css'

type GenerateValues = {
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

const defaultGenerateValues: GenerateValues = {
  angle: '从热点背后的需求和普通人的行动机会切入',
  audience: '关注效率、AI、内容运营和个人成长的公众号读者',
  tone: '清醒、克制、有洞察、有行动感',
  length: 'standard',
  generateCover: true,
  coverStyle: '干净的数据感，适合微信公众号封面',
}

export default function AdminContentFactory() {
  const { message, modal } = AntApp.useApp()
  const [generateForm] = Form.useForm<GenerateValues>()
  const [articleForm] = Form.useForm<ArticleFormValues>()
  const [status, setStatus] = useState<ContentFactoryStatus | null>(null)
  const [hotTopics, setHotTopics] = useState<ContentHotTopic[]>([])
  const [articles, setArticles] = useState<ContentArticle[]>([])
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([])
  const [activeArticle, setActiveArticle] = useState<ContentArticle | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [hotLoading, setHotLoading] = useState(false)
  const [articlesLoading, setArticlesLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [wechatAction, setWechatAction] = useState<'draft' | 'publish' | null>(null)

  const watchedHtml = Form.useWatch('contentHtml', articleForm)

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

  const loadHotTopics = async () => {
    setHotLoading(true)
    try {
      const data = await adminGetHotTopics(18)
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
    void loadHotTopics()
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

  const generateArticle = async () => {
    const values = await generateForm.validateFields()
    const payload: ContentArticleGeneratePayload = {
      ...values,
      topics: selectedTopics,
    }

    setGenerating(true)
    try {
      const article = await adminGenerateContentArticle(payload)
      upsertArticle(article)
      setDrawerOpen(true)
      message.success('文章已生成')
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

  return (
    <div className="content-factory">
      <section className="content-factory__header">
        <div>
          <Typography.Title level={3}>内容工厂</Typography.Title>
          <Typography.Paragraph type="secondary">
            热点采集、爆文草稿、封面生成和微信公众号推送集中处理。
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
        <Card className="content-factory__panel" title="热点与生成参数">
          <div className="content-factory__panel-toolbar">
            <Space wrap>
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
            <Tag color={selectedTopicIds.length ? 'processing' : 'default'}>
              已选 {selectedTopicIds.length || Math.min(5, hotTopics.length)}
            </Tag>
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

          <Form
            form={generateForm}
            layout="vertical"
            initialValues={defaultGenerateValues}
            className="content-factory__generate-form"
          >
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
            <div className="content-factory__form-grid">
              <Form.Item name="length" label="篇幅">
                <Select
                  options={[
                    { label: '短文', value: 'short' },
                    { label: '标准', value: 'standard' },
                    { label: '长文', value: 'long' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="generateCover" label="生成封面" valuePropName="checked">
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
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
              disabled={hotLoading || hotTopics.length === 0}
            >
              生成公众号文章
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

            {activeArticle.coverImageUrl ? (
              <div className="content-factory__cover-preview">
                <Image src={activeArticle.coverImageUrl} alt="文章封面" />
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
