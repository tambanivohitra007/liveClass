// Title bar renderer (titlebar.html). Talks to the main process only through window.desktop.
import type { DesktopBridge, TitlebarState } from './shared';

declare global {
  interface Window {
    desktop: DesktopBridge;
  }
}

const COPIED_MS = 1600;

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const back = el<HTMLButtonElement>('back');
const forward = el<HTMLButtonElement>('forward');
const title = el('title');
const address = el<HTMLButtonElement>('address');
const addressLabel = el('address-label');
const addressUrl = el('address-url');
const menu = el<HTMLButtonElement>('menu');
const appActions = el('app-actions');
const theme = el<HTMLButtonElement>('theme');
const bell = el<HTMLButtonElement>('bell');
const badge = el('badge');
const account = el<HTMLButtonElement>('account');
const avatar = el('avatar');

let studentUrl = '';
let copiedTimer: number | undefined;

back.addEventListener('click', () => window.desktop.back());
forward.addEventListener('click', () => window.desktop.forward());
menu.addEventListener('click', () => {
  const r = menu.getBoundingClientRect();
  window.desktop.openMenu(Math.round(r.right), Math.round(r.bottom + 4));
});
// Theme, notifications and account belong to the web app: pass the click (and where the button is) on.
const passToApp = (button: HTMLElement, action: 'toggle-theme' | 'notifications' | 'account') =>
  button.addEventListener('click', () => window.desktop.appAction(action, Math.round(button.getBoundingClientRect().right)));
passToApp(theme, 'toggle-theme');
passToApp(bell, 'notifications');
passToApp(account, 'account');

address.addEventListener('click', () => {
  if (!studentUrl) return;
  window.desktop.copyText(studentUrl);
  address.classList.add('copied');
  addressUrl.textContent = 'Copied!';
  clearTimeout(copiedTimer);
  copiedTimer = window.setTimeout(() => {
    address.classList.remove('copied');
    addressUrl.textContent = studentUrl.replace(/^https?:\/\//, '');
  }, COPIED_MS);
});

function render(s: TitlebarState): void {
  const root = document.documentElement;
  root.dataset.theme = s.dark ? 'dark' : 'light';
  root.classList.toggle('app-ready', s.appReady);
  root.classList.toggle('blurred', !s.focused);
  document.body.classList.toggle('loading', s.loading && s.appReady);

  appActions.hidden = !s.appReady || !s.account;
  theme.title = s.dark ? 'Switch to light mode' : 'Switch to dark mode';
  badge.hidden = s.unread === 0;
  badge.textContent = s.unread > 99 ? '99+' : String(s.unread);
  bell.title = s.unread ? `Notifications (${s.unread} unread)` : 'Notifications';
  avatar.textContent = s.account?.initials ?? '';
  account.title = s.account ? `${s.account.name} — account` : 'Account';

  menu.classList.toggle('open', s.menuOpen);
  menu.setAttribute('aria-expanded', String(s.menuOpen));

  back.disabled = !s.canGoBack;
  forward.disabled = !s.canGoForward;
  title.textContent = s.title;
  document.title = s.title ? `${s.title} - LiveClass` : 'LiveClass';

  address.hidden = !s.appReady;
  const url = s.studentUrls[0] ?? '';
  address.classList.toggle('offline', !url);
  if (url !== studentUrl && !address.classList.contains('copied')) {
    addressUrl.textContent = url ? url.replace(/^https?:\/\//, '') : 'No Wi-Fi';
  }
  studentUrl = url;
  addressLabel.textContent = url ? 'Students join at' : 'Offline —';
  address.title = url
    ? `Students open this address on the same Wi-Fi. Click to copy.\n${s.studentUrls.join('\n')}`
    : 'Connect this computer to Wi-Fi or turn on its hotspot so students can join.';
}

window.desktop.onState(render);
