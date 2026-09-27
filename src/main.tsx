import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/acme'
import '@fontsource/mclaren'
import './index.css'
import App from './App.tsx'
import { initNativePlugins } from './lib/nativeInit'
import { isDesktopApp, isWeb } from './lib/platform'
import { registerSW } from 'virtual:pwa-register'

initNativePlugins();

// Desktop app styling hooks (see `.desktop-app` in index.css).
if (isDesktopApp) document.documentElement.classList.add('desktop-app');

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
