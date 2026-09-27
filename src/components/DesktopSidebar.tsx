import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useSidebarStore } from '../stores/sidebarStore';
import { ADMIN_EMAIL } from '../lib/config';
import { adminItem, isNavItemActive, studentItems, teacherSections, type NavItem, type NavSection } from './sidebarNav';

/**
 * Navigation pane for the desktop app, modelled on the Windows 11 navigation view: it shares the
 * title bar's colour (one continuous frame), follows the light/dark theme, marks the current page
 * with a quiet fill and an accent bar, and behaves like native navigation rather than web links
 * (no dragging, no text selection, no opening in new windows). Same widths as the web sidebar,
 * so the page layout in App.tsx is unchanged.
 */
export default function DesktopSidebar() {
  const { firebaseUser, user } = useAuthStore();
  const { collapsed, toggleSidebar } = useSidebarStore();
  const location = useLocation();
  const navigate = useNavigate();
  const navRef = useRef<HTMLElement>(null);

  // Ctrl+B shows or hides the labels, as in VS Code, Explorer and Office.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'b') return;
      const t = e.target as HTMLElement | null;
      if (t?.isContentEditable) return;
      e.preventDefault();
      toggleSidebar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSidebar]);

  if (!firebaseUser) return null;

  const isAdmin = user?.email === ADMIN_EMAIL;
  const isApprovedTeacher = user?.role === 'teacher' && (user.approvalStatus === 'approved' || isAdmin);

  const sections: NavSection[] = isApprovedTeacher
    ? [...teacherSections, ...(isAdmin ? [{ title: 'System', items: [adminItem] }] : [])]
    : [{ title: '', items: [...studentItems, ...(isAdmin ? [adminItem] : [])] }];

  // Modified and middle clicks would open a second, bare window; in a desktop app they just navigate.
  const onLinkClick = (e: MouseEvent<HTMLAnchorElement>, path: string) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      e.preventDefault();
      navigate(path);
    }
  };
  const onLinkAuxClick = (e: MouseEvent<HTMLAnchorElement>, path: string) => {
    if (e.button !== 1) return;
    e.preventDefault();
    navigate(path);
  };

  // Up/Down arrows move between items, Home/End jump to the ends (native list behaviour).
  const onNavKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const links = Array.from(navRef.current?.querySelectorAll<HTMLAnchorElement>('a[data-nav]') ?? []);
    if (!links.length) return;
    e.preventDefault();
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    const next =
      e.key === 'Home' ? 0
      : e.key === 'End' ? links.length - 1
      : e.key === 'ArrowDown' ? (i + 1) % links.length
      : (i - 1 + links.length) % links.length;
    links[next].focus();
  };

  const renderItem = (item: NavItem) => {
    const active = isNavItemActive(item, location.pathname);
    const Icon = item.icon;
    return (
      <Link
        key={item.path}
        to={item.path}
        data-nav
        draggable={false}
        onClick={(e) => onLinkClick(e, item.path)}
        onAuxClick={(e) => onLinkAuxClick(e, item.path)}
        aria-current={active ? 'page' : undefined}
        // Collapsed: the label moves to a native Windows tooltip.
        title={collapsed ? item.label : undefined}
        className={`relative flex items-center gap-3 h-9 rounded-md no-underline cursor-default outline-none transition-colors duration-100
          focus-visible:ring-2 focus-visible:ring-brand/70
          ${collapsed ? 'w-10 mx-auto justify-center' : 'mx-1.5 px-3'}
          ${active
            ? 'bg-slate-900/[0.06] dark:bg-white/[0.08] text-slate-900 dark:text-white font-semibold'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white active:bg-slate-900/[0.07] dark:active:bg-white/[0.08]'}`}
      >
        {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-brand" />}
        <Icon className={`w-[18px] h-[18px] shrink-0 ${active ? 'text-brand' : ''}`} strokeWidth={active ? 2.2 : 1.9} />
        {!collapsed && <span className="text-[13.5px] truncate">{item.label}</span>}
      </Link>
    );
  };

  return (
    <aside
      className={`hidden md:flex fixed left-0 top-0 bottom-0 z-40 flex-col select-none
        bg-[#f8fafc] dark:bg-[#191919] border-r border-slate-200 dark:border-white/[0.07]
        transition-[width] duration-200 ease-out ${collapsed ? 'w-[68px]' : 'w-64'}`}
    >
      {/* Pane toggle, where Windows 11 apps put it. The app icon already sits in the title bar. */}
      <div className={`h-14 flex items-center shrink-0 ${collapsed ? 'justify-center' : 'px-3'}`}>
        <button
          type="button"
          onClick={toggleSidebar}
          title={collapsed ? 'Expand navigation (Ctrl+B)' : 'Collapse navigation (Ctrl+B)'}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-expanded={!collapsed}
          className="w-10 h-9 grid place-items-center rounded-md cursor-default outline-none text-slate-600 dark:text-slate-300
            hover:bg-slate-900/[0.05] dark:hover:bg-white/[0.06] active:bg-slate-900/[0.08] dark:active:bg-white/[0.09]
            focus-visible:ring-2 focus-visible:ring-brand/70"
        >
          <Menu className="w-[18px] h-[18px]" strokeWidth={1.9} />
        </button>
      </div>

      <nav
        ref={navRef}
        aria-label="Main navigation"
        onKeyDown={onNavKeyDown}
        className="nav-scroll flex-1 overflow-y-auto overflow-x-hidden pb-4"
      >
        {sections.map((section, i) => (
          <div key={section.title || i} className={i > 0 ? 'mt-3' : ''}>
            {section.title && (collapsed ? (
              i > 0 && <div className="mx-4 mb-3 border-t border-slate-200 dark:border-white/[0.07]" />
            ) : (
              <p className="px-[18px] pt-1 pb-1.5 text-[11.5px] font-semibold text-slate-500 dark:text-slate-400">
                {section.title}
              </p>
            ))}
            <div className="flex flex-col gap-0.5">{section.items.map(renderItem)}</div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
