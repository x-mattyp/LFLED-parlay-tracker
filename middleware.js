import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(req) {
  const token = req.cookies.get('lfled_session')?.value;
  let ok = false;
  if (token) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET));
      ok = true;
    } catch {}
  }
  if (!ok) return NextResponse.redirect(new URL('/login', req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!login|api/cron|_next|favicon.ico).*)'],
};
