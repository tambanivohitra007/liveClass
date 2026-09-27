// ⋯ menu overlay (menu.html). Talks to the main process only through window.desktopMenu.
import type { MenuAction, MenuBridge, MenuState } from './shared';

declare global {
  interface Window {
    desktopMenu: MenuBridge;
  }
}

const COPIED_MS = 1400;

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const panel = el('panel');
const join = el('join');
const joinLabel = el('join-label');
const joinUrl = el('join-url');
const offlineHint = el('offline-hint');
const joinActions = el('join-actions');
const copy = el<HTMLButtonElement>('copy');
const copyLabel = el('copy-label');
const qrToggle = el<HTMLButtonElement>('qr-toggle');
const qr = el('qr');
const qrSvg = el('qr-svg');
const zoom = el('zoom');
const fullScreenLabel = el('full-screen-label');
const version = el('version');

let copiedTimer: number | undefined;

function show(s: MenuState, reopened: boolean): void {
  document.documentElement.dataset.theme = s.dark ? 'dark' : 'light';
  panel.style.top = `${s.anchorTop}px`;
  panel.style.right = `${Math.max(8, window.innerWidth - s.anchorRight)}px`;
  panel.style.setProperty('--top', `${s.anchorTop}px`);

  const url = s.studentUrls[0] ?? '';
  join.classList.toggle('offline', !url);
  joinLabel.textContent = url ? 'Students join at' : 'Students can’t join yet';
  joinUrl.textContent = url ? url.replace(/^https?:\/\//, '') : 'No Wi-Fi network';
  joinUrl.title = s.studentUrls.join('\n');
  offlineHint.hidden = !!url;
  joinActions.hidden = !url;
  qrSvg.innerHTML = s.qrSvg ?? '';

  zoom.textContent = `${s.zoomPercent}%`;
  fullScreenLabel.textContent = s.fullScreen ? 'Exit full screen' : 'Full screen';
  version.textContent = `v${s.version}`;

  if (reopened) {
    // Fresh state each time the menu opens.
    setQrOpen(false);
    resetCopy();
    panel.classList.remove('show');
    requestAnimationFrame(() => panel.classList.add('show'));
    panel.focus();
  }
}

function setQrOpen(open: boolean): void {
  qr.hidden = !open;
  qrToggle.setAttribute('aria-expanded', String(open));
}

function resetCopy(): void {
  clearTimeout(copiedTimer);
  copy.classList.remove('done');
  copyLabel.textContent = 'Copy address';
}

function close(): void {
  panel.classList.remove('show');
  window.desktopMenu.close();
}

function items(): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>('.item')).filter((i) => i.offsetParent !== null);
}

// ------------------------------------------------------------------------------------------------

el('backdrop').addEventListener('mousedown', close);

copy.addEventListener('click', () => {
  window.desktopMenu.run('copy-address');
  copy.classList.add('done');
  copyLabel.textContent = 'Copied';
  clearTimeout(copiedTimer);
  copiedTimer = window.setTimeout(resetCopy, COPIED_MS);
});

qrToggle.addEventListener('click', () => setQrOpen(qr.hidden));

panel.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (target) window.desktopMenu.run(target.dataset.action as MenuAction);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
    return;
  }
  const list = items();
  if (!list.length) return;
  const index = list.indexOf(document.activeElement as HTMLElement);
  const focus = (i: number) => list[(i + list.length) % list.length].focus();
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      focus(index + 1);
      break;
    case 'ArrowUp':
      e.preventDefault();
      focus(index < 0 ? -1 : index - 1);
      break;
    case 'Home':
      e.preventDefault();
      focus(0);
      break;
    case 'End':
      e.preventDefault();
      focus(-1);
      break;
  }
});

let lastOpenedAt = 0;
window.desktopMenu.onShow((state) => {
  show(state, state.openedAt !== lastOpenedAt);
  lastOpenedAt = state.openedAt;
});
