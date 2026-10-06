import { NextResponse } from 'next/server';
import { login } from '@/lib/controlplane';
import { signSession, COOKIE } from '@/lib/session';

export async function POST(req) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }
  let user;
  try {
    ({ user } = await login(email, password));
  } catch (e) {
    const status = e.status === 401 ? 401 : 502;
    return NextResponse.json({ error: status === 401 ? 'wrong email or password' : 'auth service unavailable' }, { status });
  }
  const token = await signSession(user);
  const res = NextResponse.json({ ok: true, role: user.role });
  res.cookies.set(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: true, path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
