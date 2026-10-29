import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Middleware for handling Supabase auth code exchange and route protection.
 * Runs on every path except static assets & API routes.
 */

const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/auth/callback'];
const PROTECTED_PATHS = ['/dashboard', '/onboarding', '/account-status'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(path => pathname === path || pathname.startsWith(path + '/'));
}

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some(path => pathname === path || pathname.startsWith(path + '/'));
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams, origin } = request.nextUrl;

  const code = searchParams.get('code');
  // Password-recovery links intentionally land on /reset-password. The browser
  // Supabase client exchanges that code there, so forwarding it to /login would
  // make the login layout redirect an authenticated recovery session to the
  // dashboard before the user can choose a new password.
  if (code && pathname !== '/auth/callback' && pathname !== '/reset-password') {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/callback';
    // preserve `next` if it was passed, otherwise default to /login
    if (!searchParams.get('next')) {
      url.searchParams.set('next', '/login');
    }
    return NextResponse.redirect(url);
  }

  // Create Supabase client to check session
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Check for protected routes - redirect unauthenticated users to login
  if (isProtectedPath(pathname) && !user) {
    const loginUrl = new URL('/login', origin);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If authenticated user tries to access public auth pages, redirect to dashboard
  if (user?.email_confirmed_at && isPublicPath(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', origin));
  }

  return response;
}

export const config = {
  // Run on every path except static assets & API routes
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
