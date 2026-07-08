import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button, Result, Space } from 'antd'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  reloading: boolean
}

function isChunkLoadError(error: Error) {
  const message = `${error.name || ''} ${error.message || ''}`
  return /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed/i.test(message)
}

export default class RouteErrorBoundary extends Component<Props, State> {
  public state: State = {
    error: null,
    reloading: false,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { error, reloading: false }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('RouteErrorBoundary caught an error:', error, errorInfo)

    if (!isChunkLoadError(error)) return

    const reloadKey = `route-chunk-reload:${window.location.pathname}`
    if (sessionStorage.getItem(reloadKey) === '1') return

    sessionStorage.setItem(reloadKey, '1')
    this.setState({ reloading: true })
    window.location.reload()
  }

  public render() {
    const { error, reloading } = this.state

    if (!error) {
      return this.props.children
    }

    if (reloading) {
      return (
        <Result
          status="info"
          title="正在重新加载页面"
          subTitle="检测到页面资源更新，正在自动恢复。"
        />
      )
    }

    return (
      <Result
        status="warning"
        title="页面加载失败"
        subTitle="这次切换没有成功，可能是页面资源更新或临时网络波动。"
        extra={
          <Space wrap>
            <Button type="primary" onClick={() => window.location.reload()}>
              刷新当前页
            </Button>
            <Button onClick={() => window.history.back()}>返回上一页</Button>
            <Button href="/">回到首页</Button>
          </Space>
        }
      />
    )
  }
}
