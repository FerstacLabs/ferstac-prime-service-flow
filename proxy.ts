import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { canAccessPath, disabledAccount, roleHome } from "@/lib/security";
import {
  roleLoginUrl,
  roleOriginConfigIsValid,
  roleOriginMatches,
} from "@/lib/role-origins";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookieOptions: {
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const move = (target: string) => {
    const next = NextResponse.redirect(new URL(target, request.url));
    response.cookies.getAll().forEach((cookie) => next.cookies.set(cookie));
    return next;
  };
  if (!data.user) {
    if (path === "/login") return response;

    return path.startsWith("/api/")
      ? NextResponse.json({ error: "Giriş tələb olunur." }, { status: 401 })
      : move("/login");
  }

  const { data: profile } = await supabase.rpc("get_access_profile");

  if (!profile?.is_active || !profile.session_valid) {
    if (path === "/login") return response;

    if (path.startsWith("/api/"))
      return NextResponse.json(
        { error: "Giriş icazəsi yoxdur." },
        { status: 403 },
      );

    return move(
      profile && !profile.is_active
        ? `/login?error=${encodeURIComponent(disabledAccount)}`
        : "/login",
    );
  }

  if (!roleOriginConfigIsValid(profile.role)) {
    return path.startsWith("/api/")
      ? NextResponse.json(
          { error: "Giriş ünvanı konfiqurasiyası yanlışdır." },
          { status: 503 },
        )
      : new NextResponse("Giriş ünvanı konfiqurasiyası yanlışdır.", {
          status: 503,
        });
  }

  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const requestHost = forwardedHost || request.headers.get("host");
  const requestOrigin = requestHost
    ? `https://${requestHost}`
    : request.nextUrl.origin;

  if (!roleOriginMatches(profile.role, requestOrigin)) {
    if (path.startsWith("/api/"))
      return NextResponse.json(
        { error: "Bu hesab bu giriş ünvanı üçün deyil." },
        { status: 403 },
      );

    return move(roleLoginUrl(profile.role));
  }

  if (path === "/login") return move(roleHome(profile.role));

  if (profile.must_change_password && path !== "/change-password") {
    return path.startsWith("/api/")
      ? NextResponse.json({ error: "Şifrəni dəyişin." }, { status: 403 })
      : move("/change-password");
  }
  if (!canAccessPath(profile.role, path))
    return path.startsWith("/api/")
      ? NextResponse.json({ error: "Giriş icazəsi yoxdur." }, { status: 403 })
      : move(roleHome(profile.role));

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand).*)"],
};
