/**
 * Minimal stand-in for `next/server` used by Vitest.
 *
 * Next.js 16 does not expose a `next/server` entry that Vite can resolve in a
 * plain Node environment, but next-auth (imported via @/lib/auth) imports from
 * it. Route handlers only use NextResponse + the NextRequest type, so this
 * stub provides the runtime surface the handlers and tests rely on.
 *
 * NextRequest is intentionally typed as the base Request: route handlers only
 * read the body, and tests construct plain Request objects.
 */
export class NextResponse extends Response {
  static json(body: unknown, init?: ResponseInit) {
    return new NextResponse(JSON.stringify(body), {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
  }

  static next() {
    return new NextResponse(null, { status: 200 });
  }
}

export type NextRequest = Request;
