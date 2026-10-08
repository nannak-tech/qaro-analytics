import { NextResponse } from 'next/server';
import { COOKIE, verifyToken } from './lib/jwt';

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const session = await verifyToken(req.cookies.get(COOKIE)?.value);

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Partner (non-admin) scoping: allowlist only their own partner pages, their
  // campaigns, and ad metrics. Everything else (global analytics, users,
  // pages, funnel, other partners) is admin-only.
  if (session.role !== 'qaro_admin') {
    const home = session.pid ? `/partners/${session.pid}` : '/ads';
    const allowed =
      pathname === '/ads' ||
      pathname.startsWith('/campaigns/') ||
      (session.pid && pathname.startsWith(`/partners/${session.pid}`));
    if (!allowed) {
      const url = req.nextUrl.clone();
      url.pathname = home;
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

// Protect everything except auth pages/APIs and static assets.
export const config = {
  matcher: ['/((?!login|accept|api/login|api/accept|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)'],
};
