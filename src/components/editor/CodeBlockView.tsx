import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { Select } from 'antd'
import { EDITOR_TEXT } from './texts'

const CodeNodeViewContent = NodeViewContent as unknown as React.ComponentType<{ as?: string; className?: string }>

const SUPPORTED_LANGUAGES = [
  { value: 'plaintext', label: EDITOR_TEXT.codeBlockLangPlain },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'tsx', label: 'TSX' },
  { value: 'jsx', label: 'JSX' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'scss', label: 'SCSS' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'shell', label: 'Shell' },
  { value: 'bash', label: 'Bash' },
  { value: 'sql', label: 'SQL' },
  { value: 'xml', label: 'XML' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'swift', label: 'Swift' },
  { value: 'dart', label: 'Dart' },
]

export function CodeBlockView({ node, updateAttributes, extension }: NodeViewProps) {
  const currentLanguage = (node.attrs.language as string) || 'plaintext'
  const defaultLanguage = (extension.options as { defaultLanguage?: string }).defaultLanguage

  return (
    <NodeViewWrapper className="editor-code-block">
      <div className="editor-code-block__header" contentEditable={false}>
        <Select
          size="small"
          className="code-block-lang-picker"
          value={currentLanguage}
          onChange={(value) => updateAttributes({ language: value === 'plaintext' ? defaultLanguage ?? null : value })}
          popupMatchSelectWidth={false}
          showSearch
          placeholder={EDITOR_TEXT.codeBlockLangPlaceholder}
          options={SUPPORTED_LANGUAGES}
          filterOption={(input, option) =>
            (option?.label as string).toLowerCase().includes(input.toLowerCase()) ||
            (option?.value as string).toLowerCase().includes(input.toLowerCase())
          }
        />
      </div>
      <pre>
        <CodeNodeViewContent as="code" />
      </pre>
    </NodeViewWrapper>
  )
}
