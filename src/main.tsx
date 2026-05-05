import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initNativePlugins } from './lib/nativeInit'
import { isWeb } from './lib/platform'
import { registerSW } from 'virtual:pwa-register'

initNativePlugins();

if (isWeb) {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      // New version available — auto-reload
      window.location.reload();
    },
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
