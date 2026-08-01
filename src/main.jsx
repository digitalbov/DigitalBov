import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Só registra o service worker em produção — em dev ele intercepta os
// próprios chunks do Vite (node_modules/.vite/deps/*.js), e a estratégia
// network-first com fallback em cache serve uma versão antiga do chunk
// sempre que o Vite responde 504 durante uma re-otimização de dependências
// (comportamento normal do dev server). Isso mistura chunks novos e antigos
// do React na mesma página — sintoma: "Cannot read properties of null
// (reading 'useState'/'useRef')" em qualquer tela, mesmo após dar reload,
// porque o cache do service worker sobrevive a um hard refresh comum.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            window.location.reload()
          }
        })
      })
    }).catch(() => {})
  })
}
