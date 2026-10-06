// Pure JWT helpers — no next/headers, so this is safe to import from Edge
// middleware as well as Node server code. jose runs on both runtimes.
import { SignJWT, jwtVerify } from 'jose';

export const COOKIE = 'qaro_sess';
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || '');

export async function signSession(user) {
  return new SignJWT({
    uid: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    pid: user.partner_id || null,
    pname: user.partner_name || null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret());
}

export async function verifyToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload;
  } catch {
    return null;
  }
}

export const isAdmin = (s) => s?.role === 'qaro_admin';
