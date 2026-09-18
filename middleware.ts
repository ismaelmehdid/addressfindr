import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'better-auth.session_token';
const SECURE_SESSION_COOKIE = '__Secure-better-auth.session_token';

const PROTECTED_PREFIXES = ['/dashboard'];
const SIGN_IN_PATH = '/sign-in';

function hasSession(req: NextRequest): boolean {
  return (
    req.cookies.has(SESSION_COOKIE) || req.cookies.has(SECURE_SESSION_COOKIE)
  );
}

export default function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  if (isProtected && !hasSession(req)) {
    const url = req.nextUrl.clone();
    url.pathname = SIGN_IN_PATH;
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|auth|_next|_vercel|.*\\..*).*)'],
};
