import { useMemo, useState } from 'react'
import { Button, Space, Switch, Typography } from 'antd'
import TiptapEditor from '../components/TiptapEditor'

/**
 * 仅开发环境使用的编辑器预览页（路由由 App.tsx 以 import.meta.env.DEV 守卫）。
 * 用于在浏览器中手工/自动化验收富文本编辑器交互，不参与生产构建路由。
 */

const DEMO_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="420" viewBox="0 0 800 420">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#167d70"/>
          <stop offset="1" stop-color="#79c5b1"/>
        </linearGradient>
      </defs>
      <rect width="800" height="420" fill="url(#g)"/>
      <text x="400" y="215" font-size="42" font-family="sans-serif" fill="#ffffff" text-anchor="middle">编辑器测试图片</text>
      <text x="400" y="265" font-size="20" font-family="sans-serif" fill="#e9f4ef" text-anchor="middle">点击图片可调对齐与尺寸</text>
    </svg>`,
  )

const DEMO_CONTENT = JSON.stringify({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '语雀风格编辑器验收' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '这是一段用于验证排版效果的正文，包含' },
        { type: 'text', marks: [{ type: 'bold' }], text: '加粗' },
        { type: 'text', text: '、' },
        { type: 'text', marks: [{ type: 'italic' }], text: '斜体' },
        { type: 'text', text: '、' },
        { type: 'text', marks: [{ type: 'underline' }], text: '下划线' },
        { type: 'text', text: '、' },
        { type: 'text', marks: [{ type: 'code' }], text: '行内代码' },
        { type: 'text', text: ' 与 ' },
        {
          type: 'text',
          marks: [{ type: 'link', attrs: { href: 'https://example.com', target: '_blank' } }],
          text: '超链接',
        },
        { type: 'text', text: '。行高 1.75，中文排版更接近语雀文档。' },
      ],
    },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '无序列表项一' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '无序列表项二' }] }] },
      ],
    },
    {
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: true },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '已完成的任务' }] }],
        },
        {
          type: 'taskItem',
          attrs: { checked: false },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '待处理的任务' }] }],
        },
      ],
    },
    {
      type: 'blockquote',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '引用块：用于突出重要说明。' }] }],
    },
    {
      type: 'codeBlock',
      attrs: { language: 'typescript' },
      content: [{ type: 'text', text: 'const greeting: string = "你好，编辑器"\nconsole.log(greeting)' }],
    },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: '功能' }] }] },
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: '状态' }] }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '块拖拽手柄' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '已实现' }] }] },
          ],
        },
      ],
    },
    { type: 'image', attrs: { src: DEMO_IMAGE, alt: '测试图片', align: 'center' } },
    { type: 'horizontalRule' },
    { type: 'paragraph', content: [{ type: 'text', text: '文档末尾段落。' }] },
  ],
})

export default function DevEditorPreview() {
  const [content, setContent] = useState(DEMO_CONTENT)
  const [dark, setDark] = useState(false)
  const [saved, setSaved] = useState('')

  const handleChange = (html: string, json?: string) => {
    setContent(json ?? html)
  }

  const contentLength = useMemo(() => content.length, [content])

  return (
    <div className="dev-editor-preview" data-theme={dark ? 'dark' : 'light'}>
      <style>{`
        .dev-editor-preview {
          min-height: 100vh;
          padding: 24px clamp(16px, 6vw, 96px) 64px;
          background: var(--bg, #f5f7f6);
          color: var(--text, #242d29);
        }
        .dev-editor-preview__bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        .dev-editor-preview__shell {
          max-width: 980px;
          margin: 0 auto;
          border: 1px solid var(--border, #e2e8e4);
          border-radius: 12px;
          background: var(--panel, #ffffff);
          box-shadow: var(--shadow-md, 0 8px 28px rgb(30 52 41 / 8%));
          overflow: hidden;
        }
        .dev-editor-preview__paper {
          padding: 28px clamp(20px, 5vw, 56px) 40px;
        }
        .dev-editor-preview__title {
          width: 100%;
          border: 0;
          outline: none;
          padding: 0 0 12px;
          background: transparent;
          color: var(--text, #242d29);
          font-family: inherit;
          font-size: 28px;
          font-weight: 700;
        }
        .dev-editor-preview__saved {
          max-width: 980px;
          margin: 12px auto 0;
          color: var(--text-dim, #718079);
          font-size: 12px;
        }
      `}</style>
      <div className="dev-editor-preview__bar">
        <Typography.Title level={4} style={{ margin: 0 }}>
          编辑器预览（仅开发环境）
        </Typography.Title>
        <Space>
          <Switch
            checkedChildren="暗色"
            unCheckedChildren="亮色"
            checked={dark}
            onChange={(value) => {
              setDark(value)
              document.documentElement.setAttribute('data-theme', value ? 'dark' : 'light')
            }}
          />
          <Button
            onClick={() => {
              setSaved(`${contentLength} 字符`)
            }}
          >
            模拟保存
          </Button>
        </Space>
      </div>
      <div className="dev-editor-preview__shell">
        <div className="dev-editor-preview__paper">
          <input className="dev-editor-preview__title" placeholder="无标题文档" defaultValue="编辑器验收文档" />
          <TiptapEditor
            content={DEMO_CONTENT}
            onChange={handleChange}
            minHeight={560}
            maxHeight="none"
            showWritingStarter
          />
        </div>
      </div>
      {saved ? <div className="dev-editor-preview__saved">已保存：{saved}</div> : null}
    </div>
  )
}
