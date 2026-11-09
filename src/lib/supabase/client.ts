import { createBrowserClient } from "@supabase/ssr";

export function getSupabaseUrl(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return raw ? raw.replace(/[\r\n\s]+/g, "").replace(/\/+$/, "") : undefined;
}

export function getSupabaseAnonKey(): string | undefined {
  const raw =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return raw ? raw.replace(/[\r\n\s]+/g, "") : undefined;
}

export function isSupabaseConfigured(): boolean {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  return Boolean(
    url &&
      anonKey &&
      url.startsWith("http") &&
      !url.includes("your-project-id") &&
      anonKey !== "your-supabase-anon-key"
  );
}

export function createBrowserSupabaseClient() {
  const url = getSupabaseUrl() || "http://localhost:54321";
  const anonKey = getSupabaseAnonKey() || "local-anon-key";
  return createBrowserClient(url, anonKey);
}
