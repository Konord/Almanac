import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/server";

/** Pages anyone can open without signing in. */
const PUBLIC_PATHS = ["/login"];

/**
 * Runs before every page. It refreshes the login session if it's about to
 * expire, and sends signed-out visitors to the sign-in page.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl(), supabaseKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getClaims() checks the login is genuine, not just present.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const isPublic = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
