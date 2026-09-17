import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// ⚡ Harangin ang Adsterra script crash at appendChild errors
if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    if (
      event.message?.includes("appendChild") ||
      event.message?.includes("null") ||
      (event.filename && (event.filename.includes("fb5310e") || event.filename.includes("7784879")))
    ) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  }, true);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)