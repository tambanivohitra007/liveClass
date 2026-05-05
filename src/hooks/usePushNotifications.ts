import { useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import { isNative } from '../lib/platform';

export function usePushNotifications() {
  const { firebaseUser } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    if (!isNative || !firebaseUser) return;

    let registrationHandle: ReturnType<typeof import('@capacitor/push-notifications').PushNotifications.addListener> | undefined;
    let receivedHandle: ReturnType<typeof import('@capacitor/push-notifications').PushNotifications.addListener> | undefined;
    let actionHandle: ReturnType<typeof import('@capacitor/push-notifications').PushNotifications.addListener> | undefined;

    import('@capacitor/push-notifications').then(async ({ PushNotifications }) => {
      const permResult = await PushNotifications.requestPermissions();
      if (permResult.receive !== 'granted') return;

      await PushNotifications.register();

      // Store FCM token in user doc
      registrationHandle = PushNotifications.addListener('registration', async (token) => {
        try {
          await updateDoc(doc(db, 'users', firebaseUser.uid), {
            fcmToken: token.value,
          });
        } catch {
          // Silently fail — token update is best-effort
        }
      });

      // Foreground notification — show as toast
      receivedHandle = PushNotifications.addListener('pushNotificationReceived', (notification) => {
        addToast('info', notification.title || notification.body || 'New notification');
      });

      // Notification tap — deep link
      actionHandle = PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const data = action.notification.data;
        if (data?.pin) {
          window.location.hash = '';
          window.location.pathname = `/join?pin=${data.pin}`;
        }
      });
    });

    return () => {
      registrationHandle?.then((h) => h.remove());
      receivedHandle?.then((h) => h.remove());
      actionHandle?.then((h) => h.remove());
    };
  }, [firebaseUser, addToast]);
}
