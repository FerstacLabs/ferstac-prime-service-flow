import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { canAccessPath, disabledAccount, roleHome } from "@/lib/security";

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
      secure:
        process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") ??
        process.env.NODE_ENV === "production",
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
  if (path === "/login") return response;
  const move = (target: string) => {
    const next = NextResponse.redirect(new URL(target, request.url));
    response.cookies.getAll().forEach((cookie) => next.cookies.set(cookie));
    return next;
  };
  if (!data.user) {
    return path.startsWith("/api/")
      ? NextResponse.json({ error: "Giriş tələb olunur." }, { status: 401 })
      : move("/login");
  }
  const { data: profile } = await supabase.rpc("get_access_profile");
  if (!profile?.is_active || !profile.session_valid) {
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
