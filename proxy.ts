import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, computeGateToken, getSitePassword } from "@/lib/gate";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

const clerkReady = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY &&
    !String(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).includes("xxxxxxxx")
);

// Routes that must stay reachable while the site is locked.
const GATE_PUBLIC = ["/unlock", "/api/unlock", "/api/auth/login"];

function isGatePublic(pathname: string): boolean {
  return GATE_PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * Redirect to /unlock unless the request carries a valid gate cookie.
 * Returns a redirect response when the request should be blocked, else null.
 */
async function gateRedirect(req: NextRequest): Promise<NextResponse | null> {
  const { pathname } = req.nextUrl;
  if (isGatePublic(pathname)) return null;

  // Either the shared passcode OR a valid account session opens the gate.
  const token = req.cookies.get(GATE_COOKIE)?.value || "";
  const expected = await computeGateToken(getSitePassword());
  if (token && token === expected) return null;

  const session = req.cookies.get(SESSION_COOKIE)?.value;
  if (session && (await verifySession(session))) return null;

  const url = req.nextUrl.clone();
  url.pathname = "/unlock";
  url.search = "";
  url.searchParams.set("next", pathname + (req.nextUrl.search || ""));
  return NextResponse.redirect(url);
}

export default clerkReady
  ? clerkMiddleware(async (auth, req) => {
      const gate = await gateRedirect(req);
      if (gate) return gate;
      if (!isPublicRoute(req)) {
        await auth.protect();
      }
    })
  : async function middleware(req: NextRequest) {
      const gate = await gateRedirect(req);
      if (gate) return gate;
      return NextResponse.next();
    };

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
