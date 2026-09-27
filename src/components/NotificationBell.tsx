import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Bell, BookOpen, Gamepad2, Users, UserMinus } from 'lucide-react';
import { useNotificationStore } from '../stores/notificationStore';
import { markNotificationRead, markAllNotificationsRead } from '../hooks/useNotificationListener';
import { useAuthStore } from '../stores/authStore';
import type { AppNotification, NotificationType } from '../types/models';

const ICON_MAP: Record<NotificationType, typeof Bell> = {
  new_assignment: BookOpen,
  session_started: Gamepad2,
  class_joined: Users,
  class_removed: UserMinus,
};

function getRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getNotificationRoute(n: AppNotification): string {
  switch (n.type) {
    case 'new_assignment':
      return n.metadata.assignmentId ? `/assignment/${n.metadata.assignmentId}` : '/student/dashboard';
    case 'session_started':
      return '/join';
    case 'class_joined':
    case 'class_removed':
      return n.metadata.classroomId ? `/student/classroom/${n.metadata.classroomId}` : '/student/classes';
    default:
      return '/student/dashboard';
  }
}

export default function NotificationBell({ position = 'dropdown' }: { position?: 'dropdown' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close on route change
  const [prevPath, setPrevPath] = useState(location.pathname);
  if (prevPath !== location.pathname) {
    setPrevPath(location.pathname);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
      >
        <Bell className="w-5 h-5 text-gray-600 dark:text-white/70" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold text-white bg-danger rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <NotificationPanel
          onDone={() => setOpen(false)}
          className={`absolute w-80 bg-gradient-to-b from-[#1A3263] via-[#1E2A5E] to-[#2A1F5E] rounded-sm shadow-lg border border-gray-200 dark:border-white/10 overflow-hidden animate-slide-down ${
            position === 'right' ? 'left-full top-0 ml-2' : 'right-0 top-full mt-2'
          }`}
        />
      )}
    </div>
  );
}

/**
 * The notification list. The web bell shows it on its navy gradient (white text); the desktop app
 * shows it under the title bar's bell with `themed`, following light/dark mode.
 */
export function NotificationPanel({ className, onDone, themed = false }: { className: string; onDone: () => void; themed?: boolean }) {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotificationStore();
  const user = useAuthStore((s) => s.user);

  const handleClick = async (n: AppNotification) => {
    if (!n.read) {
      markAsRead(n.id);
      markNotificationRead(n.id).catch(() => {});
    }
    onDone();
    navigate(getNotificationRoute(n));
  };

  const handleMarkAllRead = () => {
    markAllRead();
    if (user?.id) {
      markAllNotificationsRead(user.id).catch(() => {});
    }
  };

  const text = themed ? 'text-gray-900 dark:text-white' : 'text-white';
  const itemText = themed ? 'text-gray-800 dark:text-white/90' : 'text-white/90';
  const emptyIcon = themed ? 'text-gray-300 dark:text-white/20' : 'text-white/20';
  const itemHover = themed ? 'hover:bg-gray-50 dark:hover:bg-white/5 border-gray-100 dark:border-white/5' : 'hover:bg-white/5 border-white/5';
  const unreadBg = themed ? 'bg-brand/[0.04] dark:bg-white/[0.03]' : 'bg-white/[0.03]';

  return (
    <div className={className} role="dialog" aria-label="Notifications">
      <div className="px-4 py-3 bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/10 flex items-center justify-between">
        <p className={`font-semibold text-sm ${text}`}>Notifications</p>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="text-xs text-brand hover:text-brand-dark transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Bell className={`w-8 h-8 mx-auto mb-2 ${emptyIcon}`} />
            <p className="text-sm text-gray-400 dark:text-white/40">No notifications yet</p>
          </div>
        ) : (
          notifications.map((n) => {
            const Icon = ICON_MAP[n.type] || Bell;
            return (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b ${itemHover} ${
                  !n.read ? unreadBg : ''
                }`}
              >
                <div className="mt-0.5 w-8 h-8 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-gray-500 dark:text-white/60" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${itemText}`}>{n.title}</p>
                  <p className="text-xs text-gray-500 dark:text-white/50 line-clamp-2">{n.message}</p>
                  <p className="text-[10px] text-gray-300 dark:text-white/30 mt-1">{getRelativeTime(n.createdAt)}</p>
                </div>
                {!n.read && (
                  <div className="mt-2 w-2 h-2 rounded-full bg-brand shrink-0" />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
