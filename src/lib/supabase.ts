import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The Supabase client, loaded on demand.
 *
 * manimani started local first and stays that way: with no credentials it is
 * still a working money tracker backed by localStorage. Accounts are an
 * addition, not a prerequisite, so a missing key switches a feature off rather
 * than crashing on boot.
 *
 * The import is dynamic because the library is about 67 kB gzipped, which is
 * most of the app again. A visitor trying the demo never downloads it, and a
 * signed-in visitor fetches it alongside the first paint instead of in front
 * of it.
 */

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/** Cheap, synchronous, and safe to call during render. */
export const isSupabaseConfigured = Boolean(
  url && anonKey && url.startsWith('http') && anonKey.length > 20,
);

let clientPromise: Promise<SupabaseClient | null> | null = null;

export function getSupabase(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured) return Promise.resolve(null);

  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js')
      .then(({ createClient }) =>
        createClient(url!, anonKey!, {
          auth: {
            // The magic link comes back in the URL; let the client consume it
            // and then tidy the address bar.
            detectSessionInUrl: true,
            persistSession: true,
            autoRefreshToken: true,
            flowType: 'pkce',
          },
        }),
      )
      .catch((err) => {
        console.error('[supabase] client failed to load', err);
        clientPromise = null;
        return null;
      });
  }

  return clientPromise;
}

/** Where a magic link should land. Must be allow-listed in Supabase Auth. */
export function authRedirectTo(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

/**
 * Supabase returns raw provider errors, which are accurate and unhelpful.
 * Rate limiting in particular is the one people will actually hit on the
 * built-in email service, so it gets a real explanation.
 */
export function readableAuthError(message: string): string {
  const m = message.toLowerCase();

  if (m.includes('rate limit') || m.includes('too many') || m.includes('429')) {
    return 'Too many emails have gone out for now. Supabase limits its built in email service to a few per hour. Wait a few minutes, or attach your own SMTP provider.';
  }
  if (m.includes('invalid') && m.includes('email')) {
    return 'That does not look like an email address.';
  }
  if (m.includes('redirect') || m.includes('not allowed')) {
    return 'This address is not on the project allowed redirect list yet.';
  }
  if (m.includes('signups not allowed') || m.includes('disabled')) {
    return 'New signups are turned off for this project.';
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return message;
}
