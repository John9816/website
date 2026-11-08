import { Link } from 'react-router-dom'
import ThemeToggle from '../components/ThemeToggle'

export default function RetiredKnowledgePage() {
  return (
    <main className="route-fallback">
      <div className="route-fallback__copy">
        <h1>旧知识库已下线</h1>
        <p>文档功能已统一到学城，原知识库分享链接已停止访问。</p>
        <Link to="/editor/">打开学城文档</Link>
      </div>
      <ThemeToggle />
    </main>
  )
}
