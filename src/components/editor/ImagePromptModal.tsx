import { useEffect, useState } from 'react'
import { Form, Input, Modal } from 'antd'
import { EDITOR_TEXT } from './texts'

interface Props {
  open: boolean
  onCancel: () => void
  onConfirm: (url: string) => void
}

export function ImagePromptModal({ open, onCancel, onConfirm }: Props) {
  const [url, setUrl] = useState('')
  const [previewError, setPreviewError] = useState(false)

  useEffect(() => {
    if (open) {
      setUrl('')
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
      onOk={() => trimmed && onConfirm(trimmed)}
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
            onPressEnter={() => trimmed && onConfirm(trimmed)}
            autoFocus
          />
        </Form.Item>
        {showPreview && (
          <div className="editor-image-preview" aria-label={EDITOR_TEXT.preview}>
            <img
              src={trimmed}
              alt=""
              onError={() => setPreviewError(true)}
              referrerPolicy="no-referrer"
            />
          </div>
        )}
      </Form>
    </Modal>
  )
}
