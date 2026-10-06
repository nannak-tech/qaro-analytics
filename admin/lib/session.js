// Node-side session access (server components / actions / route handlers).
// Re-exports the pure JWT helpers and adds cookie reading via next/headers.
import { cookies } from 'next/headers';
import { COOKIE, signSession, verifyToken, isAdmin } from './jwt';

export { COOKIE, signSession, verifyToken, isAdmin };

/** Read + verify the session from the request cookies. */
export async function getSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  return verifyToken(token);
}

/** Throw-free guard used by server components: returns session or null. */
export async function requireSession() {
  return getSession();
}
