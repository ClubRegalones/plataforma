import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Raiz from './Raiz'
import { inicializarTema } from './lib/tema'
import './index.css'
import './marca-png.css'
import './tema.css'
import './tema-posicion.css'

inicializarTema()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Raiz />
  </StrictMode>,
)
