import React from 'react'
import { Drawer, Form, Input, InputNumber, Select, Typography } from 'antd'
import { useKbContext } from './context'

const DOC_STATUS_OPTIONS = [
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
] as const

const KbPropertyDrawer: React.FC = () => {
  const {
    propertyDrawerOpen,
    setPropertyDrawerOpen,
    inlineDocForm,
    inlineDocParentOptions,
    handleInlineDocFormValuesChange,
    tags,
  } = useKbContext()

  const tagOptions = tags.map((tag) => ({
    value: tag.id,
    label: tag.name,
  }))

  return (
    <Drawer
      title="文档属性"
      placement="right"
      width={360}
      open={propertyDrawerOpen}
      onClose={() => setPropertyDrawerOpen(false)}
      mask={false}
      destroyOnClose={false}
    >
      <Form
        form={inlineDocForm}
        component="div"
        layout="vertical"
        onValuesChange={handleInlineDocFormValuesChange}
      >
        <Form.Item name="parentId" label="父文档">
          <Select
            allowClear
            placeholder="顶层文档"
            options={inlineDocParentOptions}
            optionFilterProp="label"
            showSearch
          />
        </Form.Item>
        <Form.Item
          name="status"
          label="状态"
          rules={[{ required: true, message: '请选择状态' }]}
        >
          <Select
            options={DOC_STATUS_OPTIONS.map((item) => ({
              value: item.value,
              label: item.label,
            }))}
          />
        </Form.Item>
        <Form.Item name="sortOrder" label="排序">
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="tagIds" label="标签">
          <Select
            mode="multiple"
            allowClear
            options={tagOptions}
            optionFilterProp="label"
            placeholder="可绑定多个标签"
          />
        </Form.Item>
        <Form.Item name="changeNote" label="版本备注">
          <Input placeholder="可选，记录本次修改" maxLength={500} />
        </Form.Item>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          修改会进入自动保存队列，本地草稿也会同步兜底；需要立即提交时可点击顶部保存。
        </Typography.Text>
      </Form>
    </Drawer>
  )
}

export default React.memo(KbPropertyDrawer)
