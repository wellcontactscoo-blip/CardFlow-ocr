import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAnonKey, getSupabaseUrl } from "./client";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const url = getSupabaseUrl() || "http://localhost:54321";
  const anonKey = getSupabaseAnonKey() || "local-anon-key";

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[]
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component; middleware handles session refresh.
        }
      },
    },
  });
}
