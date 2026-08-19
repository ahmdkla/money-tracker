import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { authRedirectTo, getSupabase, isSupabaseConfigured, readableAuthError } from '../lib/supabase';

export interface AuthState {
  session: Session | null;
  /** False until the first session check resolves; avoids an auth-screen flash. */
  ready: boolean;
  userId: string | null;
  email: string | null;
}

/**
 * Session state.
 *
 * With no backend configured this settles immediately into a signed-out,
 * ready state, so the local demo starts without waiting on a network call
 * that is never going to happen.
 */
export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void getSupabase().then(async (db) => {
      if (!db || cancelled) {
        if (!cancelled) setReady(true);
        return;
      }

      const { data } = await db.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      setReady(true);

      const { data: sub } = db.auth.onAuthStateChange((_event, next) => {
        setSession(next);
        setReady(true);
      });
      unsubscribe = () => sub.subscription.unsubscribe();
      if (cancelled) unsubscribe();
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return {
    session,
    ready,
    userId: session?.user.id ?? null,
    email: session?.user.email ?? null,
  };
}

/** Sends a magic link. Resolves to a dictionary key, or null on success. */
export async function sendMagicLink(email: string): Promise<string | null> {
  const db = await getSupabase();
  if (!db) return 'auth.errNoBackend';

  const trimmed = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return 'auth.errEmail';
  }

  const { error } = await db.auth.signInWithOtp({
    email: trimmed,
    options: {
      emailRedirectTo: authRedirectTo(),
      shouldCreateUser: true,
    },
  });

  return error ? readableAuthError(error.message) : null;
}

export async function signOut(): Promise<void> {
  const db = await getSupabase();
  await db?.auth.signOut();
}
