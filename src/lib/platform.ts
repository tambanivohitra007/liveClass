import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();
export const isWeb = Capacitor.getPlatform() === 'web';
/** Running inside the LiveClass desktop app (Electron adds this marker to its user agent, see lan/desktop/main.ts). */
export const isDesktopApp = typeof navigator !== 'undefined' && /\bLiveClassDesktop\b/.test(navigator.userAgent);
