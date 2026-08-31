import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy is only a redirect convenience for logged-out users.
 * It is NOT the authorization boundary — role checks must be repeated in the
 * route handlers / server actions themselves via requireRole().
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = /^\/(dashboard|vehicles|records)(\/|$)/.test(pathname);
  if (isProtected) {
    const hasSession = request.cookies.has("authjs.session-token");
    if (!hasSession) {
      const loginUrl = new URL("/login", request.nextUrl.origin);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/vehicles/:path*", "/records/:path*"],
};
