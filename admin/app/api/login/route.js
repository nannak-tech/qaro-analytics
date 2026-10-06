import { NextResponse } from 'next/server';

// Verifies the shared password server-side and, on success, sets the opaque
// session cookie. Constant-ish comparison; password never reaches the client.
export async function POST(req) {
  const { password } = await req.json().catch(() => ({}));
  const expected = process.env.ADMIN_PASSWORD || '';
  const token = process.env.ADMIN_SESSION_TOKEN || '';

  if (!expected || !token) {
    return NextResponse.json({ error: 'auth not configured' }, { status: 500 });
  }
  if (typeof password !== 'string' || password !== expected) {
    return NextResponse.json({ error: 'wrong password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('qaro_admin', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return res;
}

// Logout
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set('qaro_admin', '', { path: '/', maxAge: 0 });
  return res;
}
