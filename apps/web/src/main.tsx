import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/*
 * Açılış el değiştirmesi: statik açılış ekranı uygulama hazır olsa bile
 * en az MIN_BOOT_MS sahnede kalır (tören yarıda kesilmez), sonra perde
 * gibi yukarı sıyrılarak defteri açığa çıkarır.
 */
const MIN_BOOT_MS = 600
const CURTAIN_MS = 520

function dismissBootLoader() {
  const bootEl = document.getElementById('boot-loader')
  if (!bootEl) {
    return
  }

  const bootAt = (window as Window & { __gpBootAt?: number }).__gpBootAt ?? Date.now()
  const remaining = Math.max(0, MIN_BOOT_MS - (Date.now() - bootAt))

  window.setTimeout(() => {
    bootEl.classList.add('boot-loader--away')
    window.setTimeout(() => bootEl.remove(), CURTAIN_MS)
  }, remaining)
}

requestAnimationFrame(() => requestAnimationFrame(dismissBootLoader))
