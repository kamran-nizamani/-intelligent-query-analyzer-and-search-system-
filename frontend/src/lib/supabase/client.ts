import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

let supabaseInstance: SupabaseClient | null = null;

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

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}


let authBootstrapPromise: Promise<User> | null = null;

/**
 * Ensure the browser has an authenticated Supabase session before any
 * user-scoped database or Storage request. Existing permanent or anonymous
 * sessions are preserved; concurrent callers share one sign-in attempt.
 */
export async function ensureSupabaseSession(): Promise<User> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured. Check the public project URL and publishable key.");
  }

  if (!authBootstrapPromise) {
    authBootstrapPromise = (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        throw new Error(`Unable to restore the Supabase session: ${error.message}`);
      }

      if (data.session?.user) {
        return data.session.user;
      }

      const { data: anonymousData, error: signInError } =
        await supabase.auth.signInAnonymously();

      if (signInError) {
        throw new Error(`Anonymous sign-in failed: ${signInError.message}`);
      }

      if (!anonymousData.user) {
        throw new Error("Supabase anonymous sign-in did not return a user.");
      }

      return anonymousData.user;
    })().finally(() => {
      authBootstrapPromise = null;
    });
  }

  return authBootstrapPromise;
}
