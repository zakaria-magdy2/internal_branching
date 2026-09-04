import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// فك تشفير الجلسة بطريقة متوافقة مع Edge Runtime (بدون Buffer)
function decodeSession(sessionCookie: string) {
  let clean = sessionCookie.trim().replace(/^"|"$/g, '');
  try {
    clean = decodeURIComponent(clean);
  } catch {}
  clean = clean.replace(/^"|"$/g, '');

  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const decodedStr = new TextDecoder('utf-8').decode(bytes);
  return JSON.parse(decodedStr);
}

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Protect Admin Routes
  if (path.startsWith('/admin')) {
    const sessionCookie = request.cookies.get('auth_session')?.value;

    if (!sessionCookie) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    try {
      const session = decodeSession(sessionCookie);

      if (session?.role !== 'admin') {
        return NextResponse.redirect(new URL('/', request.url));
      }
    } catch {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Protect Student Routes
  if (path.startsWith('/student')) {
    const sessionCookie = request.cookies.get('auth_session')?.value;

    if (!sessionCookie) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    try {
      const session = decodeSession(sessionCookie);

      if (session?.role !== 'student') {
        return NextResponse.redirect(new URL('/', request.url));
      }
    } catch {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Inject security headers on all responses
  const response = NextResponse.next();

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/student/:path*'],
};
