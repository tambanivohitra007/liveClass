import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useNotificationStore } from '../stores/notificationStore';
import { useThemeStore } from '../stores/themeStore';
import { desktopBridge, type DesktopCommand } from '../lib/desktopBridge';
import { NotificationPanel } from './NotificationBell';
import AccountMenu from './AccountMenu';

type Panel = { type: 'notifications' | 'account'; right: number } | null;

const PANEL_CLASS =
  'bg-white dark:bg-[#262626] rounded-xl shadow-xl border border-gray-200 dark:border-white/10 overflow-hidden animate-slide-down';

/**
 * Desktop app only: the theme, notification and account buttons live in the window's title bar
 * (lan/desktop/titlebar.html) instead of the web top bar. This component tells the title bar who is
 * signed in and how many notifications are unread, and opens the matching panel right under a title
 * bar button when it is clicked. Renders nothing until a panel is open.
 */
export default function DesktopTitlebarActions() {
  const { firebaseUser, user } = useAuthStore();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const location = useLocation();
  const [panel, setPanel] = useState<Panel>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const signedIn = !!firebaseUser && !!user;
  const name = user?.displayName || 'User';
  const initials = name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  // Keep the title bar's avatar and bell badge current.
  useEffect(() => {
    desktopBridge()?.reportAccount({ signedIn, initials, name, unread: signedIn ? unreadCount : 0 });
  }, [signedIn, initials, name, unreadCount]);

  // Clicks on the title bar's buttons. Clicking the same button again closes its panel.
  useEffect(() => {
    return desktopBridge()?.onCommand((command: DesktopCommand) => {
      if (command.type === 'toggle-theme') {
        toggleTheme();
        return;
      }
      const type = command.type;
      setPanel((open) => (open?.type === type ? null : { type, right: command.right }));
    });
  }, [toggleTheme]);

  // Close on a click elsewhere in the app, on Escape, and on navigation or sign-out.
  useEffect(() => {
    if (!panel) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setPanel(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanel(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [panel]);

  const closeKey = `${location.pathname}|${signedIn}`;
  const [prevCloseKey, setPrevCloseKey] = useState(closeKey);
  if (prevCloseKey !== closeKey) {
    setPrevCloseKey(closeKey);
    setPanel(null);
  }

  if (!panel || !signedIn) return null;

  // Right-aligned with the title bar button, just below the title bar (the top of this view).
  const close = () => setPanel(null);
  return (
    <div
      ref={panelRef}
      style={{ right: Math.max(8, panel.right - 4) }}
      className={`fixed top-1.5 z-[60] ${panel.type === 'notifications' ? 'w-80' : 'w-64'}`}
    >
      {panel.type === 'notifications' ? (
        <NotificationPanel themed onDone={close} className={PANEL_CLASS} />
      ) : (
        <AccountMenu onClose={close} className={PANEL_CLASS} />
      )}
    </div>
  );
}
