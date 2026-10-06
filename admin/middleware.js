import { NextResponse } from 'next/server';
import { COOKIE, verifyToken } from './lib/jwt';

// Admin-only sections. Partner users are scoped to their own partner and are
// bounced to their partner page if they try to reach global/admin views.
const ADMIN_ONLY_EXACT = new Set(['/', '/funnel', '/partners']);

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const session = await verifyToken(req.cookies.get(COOKIE)?.value);

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Partner (non-admin) scoping.
  if (session.role !== 'qaro_admin') {
    const home = session.pid ? `/partners/${session.pid}` : '/ads';
    const blocked =
      ADMIN_ONLY_EXACT.has(pathname) ||
      (pathname.startsWith('/partners/') && session.pid && !pathname.startsWith(`/partners/${session.pid}`));
    if (blocked) {
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
  matcher: ['/((?!login|accept|api/login|api/accept|_next/static|_next/image|favicon.ico).*)'],
};
