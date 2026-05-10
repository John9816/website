import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Alert } from 'antd'

interface Props {
  children: ReactNode
  message?: string
}

interface State {
  hasError: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  }

  public static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <Alert
          message={this.props.message || '组件渲染出错'}
          description="这可能是由于内容格式不兼容或内部插件错误导致的。请尝试刷新页面或联系管理员。"
          type="error"
          showIcon
        />
      )
    }

    return this.props.children
  }
}
