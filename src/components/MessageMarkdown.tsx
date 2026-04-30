import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CodeBlock from './CodeBlock'

interface MessageMarkdownProps {
  content: string
}

const components: Components = {
  a({ href, children, ...rest }) {
    return (
      <a href={href} target="_blank" rel="noreferrer" {...rest}>
        {children}
      </a>
    )
  },
  table({ children }) {
    return (
      <div className="ai-chat__markdown-table-wrap">
        <table>{children}</table>
      </div>
    )
  },
  code({ className, children, ...rest }) {
    const match = /language-([\w-]+)/.exec(className ?? '')
    const text = String(children ?? '').replace(/\n$/, '')
    const isBlock = !!match || text.includes('\n')

    if (!isBlock) {
      return (
        <code className={className} {...rest}>
          {children}
        </code>
      )
    }

    return <CodeBlock language={match?.[1] ?? null} source={text} />
  },
  pre({ children }) {
    return <>{children}</>
  },
}

export default function MessageMarkdown({ content }: MessageMarkdownProps) {
  return (
    <div className="ai-chat__markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
