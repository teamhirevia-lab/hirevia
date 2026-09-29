import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import "@fontsource-variable/outfit"
import "@fontsource/newsreader/400.css"
import "@fontsource/newsreader/400-italic.css"
import "@fontsource/newsreader/500.css"
import App from './App.jsx'
import "./style.scss"

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
