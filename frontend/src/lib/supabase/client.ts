import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

let supabaseInstance: SupabaseClient | null = null;
let anonymousSignInPromise: Promise<User> | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  if (!supabaseInstance) {
    supabaseInstance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }

  return supabaseInstance;
}

/**
 * Ensure browser requests have a persisted Supabase user session.
 * Anonymous users receive the authenticated Postgres role, so existing
 * auth.uid()-scoped RLS policies continue to protect each user's documents.
 */
export async function ensureAuthenticatedUser(): Promise<User | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(`Unable to read the Supabase session: ${sessionError.message}`);
  }

  if (session?.user) return session.user;

  // Share one in-flight sign-in across concurrent upload/UI requests.
  if (!anonymousSignInPromise) {
    anonymousSignInPromise = supabase.auth
      .signInAnonymously()
      .then(({ data, error }) => {
        if (error) {
          throw new Error(`Supabase anonymous sign-in failed: ${error.message}`);
        }
        if (!data.user || !data.session) {
          throw new Error("Supabase anonymous sign-in did not return a user session.");
        }
        return data.user;
      })
      .finally(() => {
        anonymousSignInPromise = null;
      });
  }

  return anonymousSignInPromise;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
