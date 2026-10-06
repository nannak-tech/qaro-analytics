import { NextResponse } from 'next/server';

// Single shared-password gate. The browser only ever holds the opaque session
// token (ADMIN_SESSION_TOKEN); the password itself (ADMIN_PASSWORD) is checked
// server-side in /api/login and never leaves the server.
const COOKIE = 'qaro_admin';

export function middleware(req) {
  const token = process.env.ADMIN_SESSION_TOKEN || '';
  const ok = token && req.cookies.get(COOKIE)?.value === token;
  if (ok) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

// Protect everything except the login page, the login API, and static assets.
export const config = {
  matcher: ['/((?!login|api/login|_next/static|_next/image|favicon.ico).*)'],
};
