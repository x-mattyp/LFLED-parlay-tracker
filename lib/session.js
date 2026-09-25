import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db, check } from './db';

const COOKIE = 'lfled_session';
const key = () => new TextEncoder().encode(process.env.SESSION_SECRET);

export async function createSession(member) {
  const token = await new SignJWT({ mid: member.id })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('90d')
    .sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function verifyToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload;
  } catch {
    return null;
  }
}

// Loads the signed-in member fresh from the database on every request, so a
// PIN reset or admin change takes effect immediately.
export async function currentMember() {
  const payload = await verifyToken((await cookies()).get(COOKIE)?.value);
  if (!payload) return null;
  const rows = check(
    await db().from('members').select('id, name, is_admin, pin_hash').eq('id', payload.mid).limit(1)
  );
  const m = rows[0];
  if (!m || !m.pin_hash) return null;
  return { id: m.id, name: m.name, is_admin: m.is_admin };
}

export async function requireMember() {
  const m = await currentMember();
  if (!m) redirect('/login');
  return m;
}

export async function requireAdmin() {
  const m = await requireMember();
  if (!m.is_admin) redirect('/');
  return m;
}
