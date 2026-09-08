import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Raiz from './Raiz'
import './index.css'
import './marca-svg.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Raiz />
  </StrictMode>,
)
