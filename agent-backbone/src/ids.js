import { randomBytes } from 'node:crypto';

export const shortIdPattern = /^[A-Za-z0-9_-]{10}[AEIMQUYcgkosw048]$/;

export function shortId() {
  return randomBytes(8).toString('base64url');
}
