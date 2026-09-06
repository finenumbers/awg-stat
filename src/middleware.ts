import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { safeCallbackUrl } from "@/lib/safe-callback-url";

const publicPaths = ["/login", "/setup"];

function isPublicApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/auth/") || pathname === "/api/health";
}

function isPublicPath(pathname: string): boolean {
  return publicPaths.includes(pathname) || isPublicApiPath(pathname) || pathname.startsWith("/_next");
}

function hasSessionCookie(request: NextRequest): boolean {
  return Boolean(
    request.cookies.get("better-auth.session_token") ??
      request.cookies.get("__Secure-better-auth.session_token"),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/") && !isPublicApiPath(pathname)) {
    if (!hasSessionCookie(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!hasSessionCookie(request)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", safeCallbackUrl(pathname));
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
