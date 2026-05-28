import { useEffect, useState } from 'react'
import { Checkbox, Form, Input, Modal } from 'antd'
import { EDITOR_TEXT } from './texts'

export interface LinkPromptValue {
  url: string
  openInNewTab: boolean
}

interface Props {
  open: boolean
  initialUrl?: string
  onCancel: () => void
  onConfirm: (value: LinkPromptValue | null) => void
}

export function LinkPromptModal({ open, initialUrl = '', onCancel, onConfirm }: Props) {
  const [url, setUrl] = useState(initialUrl)
  const [openInNewTab, setOpenInNewTab] = useState(true)

  useEffect(() => {
    if (open) {
      setUrl(initialUrl)
      setOpenInNewTab(true)
    }
  }, [open, initialUrl])

  return (
    <Modal
      open={open}
      title={EDITOR_TEXT.modalLinkTitle}
      onCancel={onCancel}
      onOk={() => onConfirm({ url: url.trim(), openInNewTab })}
      okText={EDITOR_TEXT.confirm}
      cancelText={EDITOR_TEXT.cancel}
      destroyOnClose
      footer={
        initialUrl
          ? [
              <button
                key="remove"
                type="button"
                className="ant-btn ant-btn-text ant-btn-dangerous"
                onClick={() => onConfirm(null)}
              >
                {EDITOR_TEXT.remove}
              </button>,
              <button
                key="cancel"
                type="button"
                className="ant-btn"
                onClick={onCancel}
              >
                {EDITOR_TEXT.cancel}
              </button>,
              <button
                key="ok"
                type="button"
                className="ant-btn ant-btn-primary"
                onClick={() => onConfirm({ url: url.trim(), openInNewTab })}
              >
                {EDITOR_TEXT.confirm}
              </button>,
            ]
          : undefined
      }
    >
      <Form layout="vertical">
        <Form.Item label={EDITOR_TEXT.linkUrlPrompt} required>
          <Input
            value={url}
            placeholder={EDITOR_TEXT.linkUrlPlaceholder}
            onChange={(event) => setUrl(event.target.value)}
            onPressEnter={() => onConfirm({ url: url.trim(), openInNewTab })}
            autoFocus
          />
        </Form.Item>
        <Form.Item>
          <Checkbox
            checked={openInNewTab}
            onChange={(event) => setOpenInNewTab(event.target.checked)}
          >
            {EDITOR_TEXT.linkOpenInNewTab}
          </Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  )
}
