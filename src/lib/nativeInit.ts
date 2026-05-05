import { isNative } from './platform';

export async function initNativePlugins() {
  if (!isNative) return;

  const [{ SplashScreen }, { StatusBar, Style }] = await Promise.all([
    import('@capacitor/splash-screen'),
    import('@capacitor/status-bar'),
  ]);

  await StatusBar.setStyle({ style: Style.Dark });
  await StatusBar.setBackgroundColor({ color: '#0F1729' });
  await SplashScreen.hide();
}
