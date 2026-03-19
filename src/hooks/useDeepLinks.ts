import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isNative } from '../lib/platform';

export function useDeepLinks() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNative) return;

    let urlHandle: ReturnType<typeof import('@capacitor/app').App.addListener> | undefined;
    let backHandle: ReturnType<typeof import('@capacitor/app').App.addListener> | undefined;

    import('@capacitor/app').then(({ App }) => {
      // Deep link handling
      urlHandle = App.addListener('appUrlOpen', (event) => {
        try {
          const url = new URL(event.url);
          const path = url.pathname + url.search;
          if (path) navigate(path);
        } catch {
          // invalid URL, ignore
        }
      });

      // Android back button
      backHandle = App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back();
        } else {
          App.exitApp();
        }
      });
    });

    return () => {
      urlHandle?.then((h) => h.remove());
      backHandle?.then((h) => h.remove());
    };
  }, [navigate]);
}
