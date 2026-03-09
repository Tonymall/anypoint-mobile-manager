import { env } from './config';

export function isAdminRequestAuthorized(adminKey: string | undefined): boolean {
  if (!env.ADMIN_API_KEY) {
    return false;
  }

  return Boolean(adminKey) && adminKey === env.ADMIN_API_KEY;
}
