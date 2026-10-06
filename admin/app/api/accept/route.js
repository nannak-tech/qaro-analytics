import { NextResponse } from 'next/server';
import { acceptInvite } from '@/lib/controlplane';
import { signSession, COOKIE } from '@/lib/session';

export async function POST(req) {
  const { token, name, password } = await req.json().catch(() => ({}));
  if (!token || !name || !password || String(password).length < 8) {
    return NextResponse.json({ error: 'name and an 8+ character password required' }, { status: 400 });
  }
  let user;
  try {
    ({ user } = await acceptInvite(token, name, password));
  } catch (e) {
    return NextResponse.json({ error: e.message || 'could not accept invite' }, { status: e.status || 400 });
  }
  const sess = await signSession(user);
  const res = NextResponse.json({ ok: true, role: user.role });
  res.cookies.set(COOKIE, sess, {
    httpOnly: true, sameSite: 'lax', secure: true, path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
