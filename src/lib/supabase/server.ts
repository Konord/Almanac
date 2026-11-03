import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "@/lib/database.types";

/**
 * A Supabase client for use on the server (pages and server actions).
 *
 * It reads the signed-in session from the browser's cookies, so every
 * database query runs as that household. The database's security rules
 * then decide which rows it may see.
 */
export async function createClient() {
  // Database reads depend on who is signed in, so they always happen when
  // the page is requested, never ahead of time.
  await connection();
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabaseKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Pages can't set cookies, only server actions can. That's fine:
          // the proxy (src/proxy.ts) keeps the session cookie fresh.
        }
      },
    },
  });
}

export function supabaseUrl(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabaseKey(): string {
  return requireEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is missing. Copy .env.example to .env.local and fill it in.`);
  }
  return value;
}
