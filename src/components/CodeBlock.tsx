import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

interface CodeBlockProps {
  language: string | null
  source: string
}

export default function CodeBlock({ language, source }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(source)
      setCopied(true)
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="ai-chat__code-block">
      <div className="ai-chat__code-block-bar">
        <span className="ai-chat__code-block-lang">{language || 'text'}</span>
        <button
          type="button"
          className="ai-chat__code-block-copy"
          onClick={() => void handleCopy()}
          aria-label={copied ? '已复制' : '复制代码'}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      <pre className="ai-chat__code-block-pre">
        <code>{source}</code>
      </pre>
    </div>
  )
}
