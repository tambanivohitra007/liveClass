import { lan } from '../lan/connection';

/**
 * Administrator of this LiveClass server (the first account created on it).
 * A live binding: importers always see the current value.
 */
export let ADMIN_EMAIL = '';
lan().onAdminEmail((email) => {
  ADMIN_EMAIL = email ?? '';
});

const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

/**
 * Base URL students use to join (QR codes, links). When the teacher opens LiveClass on the
 * server machine itself (localhost), this is the machine's Wi-Fi/LAN address instead.
 */
export let APP_URL: string = import.meta.env.VITE_APP_URL || window.location.origin;
/** Host shown in "Or go to <host> and enter the PIN". */
export let APP_HOST: string = new URL(APP_URL).host;

lan().onAddresses((addresses) => {
  if (import.meta.env.VITE_APP_URL || !isLoopback || addresses.length === 0) return;
  APP_URL = addresses[0];
  APP_HOST = new URL(APP_URL).host;
});
