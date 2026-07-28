import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Redirect-to-login middleware for protected routes (#406).
 *
 * Runs at the edge (no Node.js APIs, no localStorage access) so the auth
 * token is read from a cookie. The SDK persists the token to localStorage
 * for API requests (see packages/sdk/src/client.ts, #405); when the app sets
 * that token it should also set this cookie (e.g. on login) so middleware
 * can see it.
 */
export const AUTH_TOKEN_COOKIE = "delego_auth_token";

const PROTECTED_ROUTES = ["/delegations", "/orders", "/wallet", "/settings"];

const PUBLIC_ROUTES = ["/login", "/register", "/"];

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) =>
      pathname === route || (route !== "/" && pathname.startsWith(`${route}/`))
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicRoute(pathname) || !isProtectedRoute(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_TOKEN_COOKIE)?.value;
  if (token) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("returnTo", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/delegations/:path*",
    "/orders/:path*",
    "/wallet/:path*",
    "/settings/:path*",
  ],
};
