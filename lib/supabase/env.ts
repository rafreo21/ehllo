export type PublicSupabaseConfig = {
  url: string;
  anonKey: string;
  appUrl: string;
};

export function readPublicSupabaseConfig(
  source: Record<string, string | undefined> = process.env,
): { config: PublicSupabaseConfig | null; missing: string[] } {
  const publishableKey =
    source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    source.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    source.SUPABASE_PUBLISHABLE_KEY;
  const required = {
    NEXT_PUBLIC_SUPABASE_URL:
      source.NEXT_PUBLIC_SUPABASE_URL ?? source.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  };
  const missing = Object.entries(required).filter(([, value]) => !value?.trim()).map(([key]) => key);
  if (missing.length) return { config: null, missing };
  return {
    config: {
      url: required.NEXT_PUBLIC_SUPABASE_URL!,
      anonKey: required.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      appUrl: source.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ?? "",
    },
    missing: [],
  };
}

export function requirePublicSupabaseConfig(source = process.env): PublicSupabaseConfig {
  const result = readPublicSupabaseConfig(source);
  if (!result.config) throw new Error(`ehllo Supabase configuration is missing: ${result.missing.join(", ")}`);
  return result.config;
}
