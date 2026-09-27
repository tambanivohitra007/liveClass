// Preload for the LiveClass web app view. Exposes nothing to the page; it only reports the
// app's light/dark theme (the `dark` class on <html>) so the title bar can match it.
import { ipcRenderer } from 'electron';

let last: boolean | null = null;
const report = () => {
  const dark = document.documentElement.classList.contains('dark');
  if (dark === last) return;
  last = dark;
  ipcRenderer.send('app:theme', dark);
};

window.addEventListener('DOMContentLoaded', () => {
  report();
  new MutationObserver(report).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
});
