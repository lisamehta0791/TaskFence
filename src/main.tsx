import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { initWebMCP } from './lib/webmcp'
import { initSessionPersistence } from './lib/store/sessionPersistence'

import './styles/global.css'
import './styles/ui.css'
import './styles/layout.css'
import './styles/product.css'

// Restore the previous session (localStorage only — there is no server) and
// register the WebMCP tools, both before React mounts, so an agent that
// attaches early finds a fully described page rather than an empty one.
initSessionPersistence()
initWebMCP()

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
