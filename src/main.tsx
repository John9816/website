import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installViewportMetrics } from './utils/viewport'
import './index.css'
import './styles/tokens.css'

installViewportMetrics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
