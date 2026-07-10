import { useEffect, useState } from 'react'
import { Form, Input, Modal } from 'antd'
import { EDITOR_TEXT } from './texts'

interface Props {
  open: boolean
  onCancel: () => void
  onConfirm: (value: { url: string; alt?: string }) => void
}

export function ImagePromptModal({ open, onCancel, onConfirm }: Props) {
  const [url, setUrl] = useState('')
  const [alt, setAlt] = useState('')
  const [previewError, setPreviewError] = useState(false)

  useEffect(() => {
    if (open) {
      setUrl('')
      setAlt('')
      setPreviewError(false)
    }
  }, [open])

  const trimmed = url.trim()
  const showPreview = trimmed.length > 0 && !previewError

  return (
    <Modal
      open={open}
      title={EDITOR_TEXT.modalImageTitle}
      onCancel={onCancel}
      onOk={() => trimmed && onConfirm({ url: trimmed, alt: alt.trim() || undefined })}
      okText={EDITOR_TEXT.confirm}
      cancelText={EDITOR_TEXT.cancel}
      okButtonProps={{ disabled: !trimmed }}
      destroyOnClose
    >
      <Form layout="vertical">
        <Form.Item label={EDITOR_TEXT.imageUrlPrompt} required>
          <Input
            value={url}
            placeholder={EDITOR_TEXT.imageUrlPlaceholder}
            onChange={(event) => {
              setUrl(event.target.value)
              setPreviewError(false)
            }}
            onPressEnter={() => trimmed && onConfirm({ url: trimmed, alt: alt.trim() || undefined })}
            autoFocus
          />
        </Form.Item>
        <Form.Item label={EDITOR_TEXT.imageAltPrompt}>
          <Input
            value={alt}
            placeholder={EDITOR_TEXT.imageAltPlaceholder}
            onChange={(event) => setAlt(event.target.value)}
            onPressEnter={() => trimmed && onConfirm({ url: trimmed, alt: alt.trim() || undefined })}
          />
        </Form.Item>
        {showPreview && (
          <div className="editor-image-preview" aria-label={EDITOR_TEXT.preview}>
            <img
              src={trimmed}
              alt={alt}
              onError={() => setPreviewError(true)}
              referrerPolicy="no-referrer"
            />
          </div>
        )}
      </Form>
    </Modal>
  )
}
