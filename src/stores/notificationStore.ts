import { create } from 'zustand';
import type { AppNotification } from '../types/models';

interface NotificationStore {
  notifications: AppNotification[];
  unreadCount: number;
  setNotifications: (notifs: AppNotification[]) => void;
  markAsRead: (id: string) => void;
  markAllRead: () => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  unreadCount: 0,
  setNotifications: (notifs) =>
    set({
      notifications: notifs,
      unreadCount: notifs.filter((n) => !n.read).length,
    }),
  markAsRead: (id) =>
    set((s) => {
      const updated = s.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      );
      return {
        notifications: updated,
        unreadCount: updated.filter((n) => !n.read).length,
      };
    }),
  markAllRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),
}));
