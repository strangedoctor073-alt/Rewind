import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Timeline from './Timeline'
import './timeline.css'

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Timeline />
    </StrictMode>
  )
}
