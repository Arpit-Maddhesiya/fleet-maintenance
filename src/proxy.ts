import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy is only a redirect convenience for logged-out users.
 * It is NOT the authorization boundary — role checks must be repeated in the
 * route handlers / server actions themselves via requireRole().
 *
 * The session cookie name depends on the protocol: over HTTPS NextAuth uses
 * the `__Secure-` prefix (authjs.session-token -> __Secure-authjs.session-token),
 * while plain-HTTP dev URLs get the unprefixed name. Both must be checked so
 * the redirect matches what the deployed (https) app actually sets.
 */
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = /^\/(dashboard|vehicles|service-records|users)(\/|$)/.test(pathname);
  if (isProtected) {
    const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
    if (!hasSession) {
      const loginUrl = new URL("/login", request.nextUrl.origin);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/vehicles/:path*",
    "/service-records/:path*",
    "/users/:path*",
  ],
};
