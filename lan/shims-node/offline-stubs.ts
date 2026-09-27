// Stand-ins for packages that only make sense with internet access (URL scraping, SMTP).
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Transporter = { sendMail(opts: unknown): Promise<unknown> };
export function load(_html?: unknown): any {
  throw new Error('Importing from a web page is not available offline');
}
export function createTransport(_opts?: unknown): Transporter {
  return { sendMail: async () => ({ accepted: [] }) };
}
export default { load, createTransport };
