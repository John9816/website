import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, App as AntApp, Button, Card, Form, InputNumber, Modal, Popconfirm, Progress, Space, Statistic, Steps, Switch, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DeleteOutlined, PlusCircleOutlined, ReloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import {
  getAdminOreatePool,
  getAdminOreateRegisterJob,
  importAdminOreateRegisteredAccounts,
  refreshAdminOreateJt,
  reloadAdminOreatePool,
  removeAdminOreateAccount,
  startAdminOreateRegisterChain,
  type OreatePoolAccountView,
  type OreateRegisterJobView,
} from '../api/oreate'

const { Text, Paragraph } = Typography

const zh = {
  active: '\u53ef\u7528',
  expired: '\u5df2\u8fc7\u671f',
  error: '\u5f02\u5e38',
  queued: '\u6392\u961f\u4e2d',
  running: '\u8fd0\u884c\u4e2d',
  succeeded: '\u5df2\u5b8c\u6210',
  failed: '\u5931\u8d25',
  unknown: '\u672a\u77e5',
  registerDone: '\u81ea\u52a8\u6ce8\u518c\u5df2\u5b8c\u6210',
  registerEnded: '\u81ea\u52a8\u6ce8\u518c\u5df2\u7ed3\u675f',
  registerStarted: '\u81ea\u52a8\u6ce8\u518c\u4efb\u52a1\u5df2\u542f\u52a8',
  imported: '\u5df2\u5bfc\u5165\u6ce8\u518c\u8d26\u53f7',
  email: '\u90ae\u7bb1',
  password: '\u5bc6\u7801',
  status: '\u72b6\u6001',
  balance: '\u989d\u5ea6',
  source: '\u6765\u6e90',
  updatedAt: '\u66f4\u65b0\u65f6\u95f4',
  action: '\u64cd\u4f5c',
  chars: '\u5b57\u7b26',
  removeConfirm: '\u786e\u8ba4\u79fb\u9664\u8fd9\u4e2a\u8d26\u53f7\uff1f',
  removed: '\u5df2\u79fb\u9664',
  remove: '\u79fb\u9664',
  poolTitle: '\u751f\u56fe\u53f7\u6c60',
  checkAll: '\u68c0\u67e5\u5168\u90e8',
  reloadPool: '\u91cd\u8f7d\u53f7\u6c60',
  poolReloaded: '\u53f7\u6c60\u5df2\u91cd\u8f7d',
  importRegistered: '\u5bfc\u5165\u5df2\u6ce8\u518c',
  autoRegister: '\u81ea\u52a8\u6ce8\u518c',
  jtRefreshed: 'JT \u5df2\u5237\u65b0',
  refreshJt: '\u5237\u65b0 JT',
  info: '\u8fd9\u91cc\u7528\u4e8e\u7ba1\u7406 Oreate \u751f\u56fe\u8d26\u53f7\u6c60\u3002\u81ea\u52a8\u6ce8\u518c\u4f1a\u521b\u5efa\u90ae\u7bb1\u3001\u6ce8\u518c Oreate\u3001\u9a8c\u8bc1\u90ae\u4ef6\u5e76\u5bfc\u5165\u8d26\u53f7\u6c60\u3002',
  registerJob: '\u81ea\u52a8\u6ce8\u518c\u4efb\u52a1',
  targetCount: '\u76ee\u6807\u6570\u91cf\uff1a',
  total: '\u603b\u6570',
  inactive: '\u4e0d\u53ef\u7528',
  totalBalance: '\u603b\u989d\u5ea6',
  modalTitle: '\u81ea\u52a8\u6ce8\u518c Oreate \u8d26\u53f7',
  start: '\u5f00\u59cb',
  cancel: '\u53d6\u6d88',
  registerCount: '\u6ce8\u518c\u6570\u91cf',
  registerCountRequired: '\u8bf7\u8f93\u5165\u6ce8\u518c\u6570\u91cf',
  autoImport: '\u6ce8\u518c\u6210\u529f\u540e\u81ea\u52a8\u5bfc\u5165\u53f7\u6c60',
  reset: '\u6e05\u7a7a\u6ce8\u518c\u8bb0\u5f55\u540e\u91cd\u65b0\u6ce8\u518c',
  resetTip: '\u53ea\u5f71\u54cd\u6ce8\u518c\u5668\u672c\u5730\u8bb0\u5f55\uff0c\u4e0d\u4f1a\u5220\u9664 Oreate \u5df2\u6709\u8d26\u53f7',
  resetProxyPool: '\u5bfc\u5165\u540e\u91cd\u7f6e\u53f7\u6c60',
  resetProxyPoolTip: '\u5f00\u542f\u540e\u4f1a\u6e05\u7a7a\u5f53\u524d\u53f7\u6c60\u5e76\u5bfc\u5165\u65b0\u8d26\u53f7',
  codeAttempts: '\u9a8c\u8bc1\u7801\u68c0\u67e5\u6b21\u6570',
  codeInterval: '\u68c0\u67e5\u95f4\u9694\u79d2',
} as const

type RegisterFormValues = {
  count: number
  reset?: boolean
  autoImport?: boolean
  resetProxyPool?: boolean
  codeAttempts?: number
  codeInterval?: number
}

function jobIdOf(job?: OreateRegisterJobView | null) {
  return String(job?.job_id || job?.jobId || job?.id || '')
}

function isJobRunning(status?: string) {
  return ['queued', 'running'].includes(String(status || '').toLowerCase())
}

function statusLabel(status?: string) {
  const value = String(status || '').toLowerCase()
  if (value === 'active') return zh.active
  if (value === 'expired') return zh.expired
  if (value === 'error') return zh.error
  if (value === 'queued') return zh.queued
  if (value === 'running') return zh.running
  if (value === 'succeeded') return zh.succeeded
  if (value === 'failed') return zh.failed
  return status || zh.unknown
}

function stepStatus(status?: string): 'wait' | 'process' | 'finish' | 'error' {
  const value = String(status || '').toLowerCase()
  if (value === 'done' || value === 'succeeded') return 'finish'
  if (value === 'failed' || value === 'error') return 'error'
  if (value === 'running') return 'process'
  return 'wait'
}

export default function AdminOreatePool() {
  const { message } = AntApp.useApp()
  const [form] = Form.useForm<RegisterFormValues>()
  const [loading, setLoading] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [registerCount, setRegisterCount] = useState(1)
  const [registering, setRegistering] = useState(false)
  const [importing, setImporting] = useState(false)
  const [job, setJob] = useState<OreateRegisterJobView | null>(null)
  const [rows, setRows] = useState<OreatePoolAccountView[]>([])
  const [raw, setRaw] = useState<any>({})
  const timerRef = useRef<number | null>(null)

  const load = async (force = false) => {
    setLoading(true)
    try {
      const data = await getAdminOreatePool(force)
      setRaw(data)
      setRows(Array.isArray(data.accounts) ? data.accounts : [])
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const pollJob = async (id: string) => {
    if (!id) return
    try {
      const data = await getAdminOreateRegisterJob(id)
      setJob(data)
      if (isJobRunning(data.status)) {
        timerRef.current = window.setTimeout(() => void pollJob(id), 4000)
      } else {
        message.success(data.status === 'succeeded' ? zh.registerDone : zh.registerEnded)
        await reloadAdminOreatePool()
        await load(true)
      }
    } catch (e) {
      message.error((e as Error).message)
    }
  }

  const clearJobTimer = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = null
  }

  useEffect(() => {
    void load(false)
    return clearJobTimer
  }, [])

  const startRegister = async (values: RegisterFormValues) => {
    clearJobTimer()
    setRegistering(true)
    try {
      const data = await startAdminOreateRegisterChain({
        count: values.count || registerCount || 1,
        reset: Boolean(values.reset),
        autoImport: values.autoImport !== false,
        resetProxyPool: Boolean(values.resetProxyPool),
        codeAttempts: values.codeAttempts || 20,
        codeInterval: values.codeInterval || 4,
      })
      setJob(data)
      setRegisterCount(values.count || registerCount || 1)
      setRegisterOpen(false)
      message.success(zh.registerStarted)
      const id = jobIdOf(data)
      if (id) void pollJob(id)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setRegistering(false)
    }
  }

  const importRegistered = async () => {
    setImporting(true)
    try {
      await importAdminOreateRegisteredAccounts({ resetProxyPool: false })
      await reloadAdminOreatePool()
      message.success(zh.imported)
      await load(true)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setImporting(false)
    }
  }

  const totalBalance = useMemo(() => rows.reduce((sum, row) => sum + Number(row.balance ?? 0), 0) || Number(raw.totalBalance ?? 0), [rows, raw])
  const active = rows.filter(r => String(r.status ?? '').toLowerCase().includes('active') || Number(r.balance ?? 0) > 0).length
  const currentJobId = jobIdOf(job)

  const columns: ColumnsType<OreatePoolAccountView> = [
    { title: zh.email, dataIndex: 'email', ellipsis: true, width: 240, render: v => <Text copyable>{String(v || '-')}</Text> },
    { title: zh.password, dataIndex: 'password', width: 180, render: v => v ? <Text copyable code>{String(v)}</Text> : '-' },
    { title: zh.status, dataIndex: 'status', width: 110, render: v => <Tag color={String(v).toLowerCase().includes('error') || String(v).toLowerCase().includes('expired') ? 'red' : 'green'}>{statusLabel(String(v || 'unknown'))}</Tag> },
    { title: zh.balance, dataIndex: 'balance', width: 100, sorter: (a,b) => Number(a.balance ?? 0) - Number(b.balance ?? 0) },
    { title: 'JT', dataIndex: 'jtLength', width: 100, render: (v, r) => Number(v || r.jtLength || 0) ? `${Number(v || r.jtLength)} ${zh.chars}` : '-' },
    { title: zh.source, dataIndex: 'source', ellipsis: true, render: v => String(v || '-') },
    { title: zh.updatedAt, width: 170, render: (_, r) => String(r.updatedAt || r.lastCheckedAt || r.capturedAt || '-') },
    { title: zh.action, width: 100, fixed: 'right', render: (_, __, index) => <Popconfirm title={zh.removeConfirm} onConfirm={async () => { await removeAdminOreateAccount(index); message.success(zh.removed); void load(true) }}><Button danger size="small" icon={<DeleteOutlined />}>{zh.remove}</Button></Popconfirm> },
  ]

  return <div className="admin-oreate-pool">
    <Card
      title={zh.poolTitle}
      extra={<Space wrap>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => load(true)}>{zh.checkAll}</Button>
        <Button onClick={async () => { await reloadAdminOreatePool(); message.success(zh.poolReloaded); void load(true) }}>{zh.reloadPool}</Button>
        <Button loading={importing} onClick={importRegistered}>{zh.importRegistered}</Button>
        <InputNumber min={1} max={100} value={registerCount} onChange={value => setRegisterCount(Number(value || 1))} style={{ width: 96 }} />
        <Button type="primary" icon={<PlusCircleOutlined />} onClick={() => { form.setFieldsValue({ count: registerCount }); setRegisterOpen(true) }}>{zh.autoRegister}</Button>
        <Button icon={<SafetyCertificateOutlined />} onClick={async () => { await refreshAdminOreateJt({ replace: true }); message.success(zh.jtRefreshed); void load(true) }}>{zh.refreshJt}</Button>
      </Space>}
    >
      <Alert
        showIcon
        type="info"
        style={{ marginBottom: 16 }}
        message={zh.info}
      />

      {job && <Alert
        type={isJobRunning(job.status) ? 'warning' : job.status === 'succeeded' ? 'success' : 'error'}
        showIcon
        style={{ marginBottom: 16 }}
        message={<Space wrap><Text strong>{zh.registerJob}</Text><Tag>{statusLabel(job.status)}</Tag>{currentJobId && <Text copyable>{currentJobId}</Text>}</Space>}
        description={<div>
          <Paragraph style={{ marginBottom: 6 }}>{zh.targetCount}{String(job.count ?? '-')}</Paragraph>
          <Progress percent={Number(job.progress ?? 0)} status={job.status === 'failed' ? 'exception' : job.status === 'succeeded' ? 'success' : 'active'} />
          {Array.isArray(job.steps) && job.steps.length ? <Steps
            direction="vertical"
            size="small"
            current={Math.max(0, job.steps.findIndex(step => String(step.status || '').toLowerCase() === 'pending'))}
            items={job.steps.map(step => ({
              title: String(step.label || step.key || '-'),
              status: stepStatus(step.status),
              description: <Space direction="vertical" size={0}>
                {step.email ? <Text copyable>{step.email}</Text> : null}
                {step.time ? <Text type="secondary">{new Date(Number(step.time) * 1000).toLocaleString()}</Text> : null}
              </Space>,
            }))}
            style={{ marginTop: 12, marginBottom: 12 }}
          /> : null}
          {job.stdout ? <pre style={{ maxHeight: 180, overflow: 'auto', margin: 0 }}>{String(job.stdout).slice(-3000)}</pre> : null}
          {job.stderr ? <pre style={{ maxHeight: 140, overflow: 'auto', color: '#cf1322', margin: 0 }}>{String(job.stderr).slice(-2000)}</pre> : null}
        </div>}
      />}

      <Space size="large" wrap style={{ marginBottom: 16 }}>
        <Statistic title={zh.total} value={rows.length || Number(raw.total ?? 0)} />
        <Statistic title={zh.active} value={active || Number(raw.active ?? 0)} />
        <Statistic title={zh.inactive} value={Math.max(0, rows.length - active)} />
        <Statistic title={zh.totalBalance} value={totalBalance} />
      </Space>
      <Table rowKey={(r, i) => `${r.email || 'account'}-${i}`} columns={columns} dataSource={rows} loading={loading} pagination={{ pageSize: 10 }} scroll={{ x: 1120 }} />
    </Card>

    <Modal
      title={zh.modalTitle}
      open={registerOpen}
      onCancel={() => setRegisterOpen(false)}
      okText={zh.start}
      cancelText={zh.cancel}
      confirmLoading={registering}
      onOk={() => form.submit()}
      destroyOnClose
    >
      <Form<RegisterFormValues>
        form={form}
        layout="vertical"
        initialValues={{ count: 1, autoImport: true, reset: false, resetProxyPool: false, codeAttempts: 20, codeInterval: 4 }}
        onFinish={startRegister}
      >
        <Form.Item name="count" label={zh.registerCount} rules={[{ required: true, message: zh.registerCountRequired }]}> 
          <InputNumber min={1} max={100} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="autoImport" label={zh.autoImport} valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="reset" label={zh.reset} valuePropName="checked" tooltip={zh.resetTip}>
          <Switch />
        </Form.Item>
        <Form.Item name="resetProxyPool" label={zh.resetProxyPool} valuePropName="checked" tooltip={zh.resetProxyPoolTip}>
          <Switch />
        </Form.Item>
        <Space style={{ width: '100%' }}>
          <Form.Item name="codeAttempts" label={zh.codeAttempts} style={{ flex: 1 }}>
            <InputNumber min={5} max={60} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="codeInterval" label={zh.codeInterval} style={{ flex: 1 }}>
            <InputNumber min={2} max={20} style={{ width: '100%' }} />
          </Form.Item>
        </Space>
      </Form>
    </Modal>
  </div>
}
