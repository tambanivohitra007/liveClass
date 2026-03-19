import { isNative } from './platform';
import type { HapticsPlugin } from '@capacitor/haptics';

const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;

let _haptics: HapticsPlugin | null = null;

if (isNative) {
  import('@capacitor/haptics').then((m) => {
    _haptics = m.Haptics;
  });
}

export function hapticLight() {
  if (isNative && _haptics) {
    _haptics.impact({ style: 'LIGHT' as import('@capacitor/haptics').ImpactStyle });
  } else if (canVibrate) {
    navigator.vibrate(10);
  }
}

export function hapticMedium() {
  if (isNative && _haptics) {
    _haptics.impact({ style: 'MEDIUM' as import('@capacitor/haptics').ImpactStyle });
  } else if (canVibrate) {
    navigator.vibrate(25);
  }
}

export function hapticSuccess() {
  if (isNative && _haptics) {
    _haptics.notification({ type: 'SUCCESS' as import('@capacitor/haptics').NotificationType });
  } else if (canVibrate) {
    navigator.vibrate([10, 50, 20]);
  }
}

export function hapticError() {
  if (isNative && _haptics) {
    _haptics.notification({ type: 'ERROR' as import('@capacitor/haptics').NotificationType });
  } else if (canVibrate) {
    navigator.vibrate([30, 50, 30]);
  }
}
