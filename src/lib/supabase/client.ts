import { createBrowserClient } from "@supabase/ssr";

export function getSupabaseAnonKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321";
  const anonKey = getSupabaseAnonKey() || "local-anon-key";
  return createBrowserClient(url, anonKey);
}
