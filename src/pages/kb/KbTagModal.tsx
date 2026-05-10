import React from 'react'
import { Button, Card, Col, Form, Input, Modal, Popconfirm, Row, Space, Table, Tag } from 'antd'
import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { useKbContext } from './context'
import type { KbTag } from '../../types'

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}

const KbTagModal: React.FC = () => {
  const {
    tagModalOpen,
    setTagModalOpen,
    tags,
    tagsLoading,
    tagSaving,
    editingTag,
    tagForm,
    handleEditTag,
    handleSaveTag,
    handleDeleteTag,
  } = useKbContext()

  return (
    <Modal
      title="标签管理"
      open={tagModalOpen}
      onCancel={() => {
        setTagModalOpen(false)
        // Resetting state is handled in context actions or via useEffect if needed
      }}
      footer={null}
      width={760}
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Table<KbTag>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={tags}
          loading={tagsLoading}
          columns={[
            {
              title: '标签',
              dataIndex: 'name',
              render: (_: string, row) => (
                <Tag color={row.color || 'blue'} bordered={false}>
                  {row.name}
                </Tag>
              ),
            },
            { title: '颜色', dataIndex: 'color', width: 120, render: (value: string) => value || '-' },
            { title: '创建时间', dataIndex: 'createdAt', width: 180, render: (value: string) => formatDateTime(value) },
            {
              title: '操作',
              width: 160,
              render: (_: unknown, row) => (
                <Space>
                  <Button size="small" onClick={() => handleEditTag(row)} icon={<EditOutlined />}>
                    编辑
                  </Button>
                  <Popconfirm title="确定删除这个标签吗？" onConfirm={() => void handleDeleteTag(row.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />}>
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />

        <Card
          size="small"
          title={editingTag ? '编辑标签' : '新建标签'}
          extra={
            editingTag ? (
              <Button
                size="small"
                onClick={() => {
                  tagForm.resetFields()
                  // Need to reset editingTag via context action
                }}
              >
                取消编辑
              </Button>
            ) : null
          }
        >
          <Form form={tagForm} layout="vertical">
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入标签名称' }]}>
                  <Input maxLength={50} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="color" label="颜色">
                  <Input maxLength={20} placeholder="如 #1677ff 或 volcano" />
                </Form.Item>
              </Col>
            </Row>
            <Button type="primary" onClick={() => void handleSaveTag()} loading={tagSaving}>
              {editingTag ? '保存标签' : '创建标签'}
            </Button>
          </Form>
        </Card>
      </Space>
    </Modal>
  )
}

export default React.memo(KbTagModal)
