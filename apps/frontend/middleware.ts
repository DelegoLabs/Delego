import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sanitizeRedirectUrl } from "./lib/redirect";
import { securityHeaders } from "./lib/securityHeaders";


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

/**
 * Apply the security headers to a response (#757).
 *
 * `headers()` in next.config runs after middleware, so anything middleware
 * returns early — the login redirect — would otherwise ship with none of
 * them and stay embeddable in an attacker's iframe.
 */
function withSecurityHeaders(response: NextResponse): NextResponse {
  for (const { key, value } of securityHeaders) {
    response.headers.set(key, value);
  }
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicRoute(pathname) || !isProtectedRoute(pathname)) {
    return withSecurityHeaders(NextResponse.next());
  }

  const token = request.cookies.get(AUTH_TOKEN_COOKIE)?.value;
  if (token) {
    return withSecurityHeaders(NextResponse.next());
  }

  const loginUrl = new URL("/login", request.url);
  // Sanitised on the way out as well as in: the login page must still call
  // sanitizeRedirectUrl on what it reads back, since the user can edit the URL.
  loginUrl.searchParams.set("returnTo", sanitizeRedirectUrl(pathname));
  return withSecurityHeaders(NextResponse.redirect(loginUrl));
}

export const config = {
  // Every page, so the headers reach middleware-returned responses too.
  // Static assets and the Next.js internals are excluded: they are served
  // without running middleware and carry the next.config headers already.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js).*)"],
};
