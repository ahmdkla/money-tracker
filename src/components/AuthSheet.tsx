import { useEffect, useState } from 'react';
import { EnvelopeSimple, Lock, PaperPlaneTilt } from '@phosphor-icons/react';
import { sendMagicLink } from '../store/auth';
import { useApp } from '../store/AppContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { Sheet } from './primitives';

type Stage = 'form' | 'sending' | 'sent';

/**
 * Sign in with a magic link.
 *
 * There is no password and no separate signup: the same form creates an
 * account or signs you back into one, which is the whole point of the link.
 * The confirmation screen names the address the link went to, because the
 * most common failure here is a typo nobody notices.
 */
export function AuthSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useApp();
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<Stage>('form');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStage('form');
    setError(null);
  }, [open]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (stage === 'sending') return;
    setError(null);
    setStage('sending');

    const problem = await sendMagicLink(email);
    if (problem) {
      setError(problem);
      setStage('form');
      return;
    }
    setStage('sent');
  }

  if (!isSupabaseConfigured) {
    return (
      <Sheet open={open} onClose={onClose} title={t('auth.notSetUpTitle')}>
        <div className="pb-6 pt-1">
          <div
            className="flex items-start gap-2.5 rounded-field bg-ink-50 px-3 py-3 dark:bg-night-raised"
            style={{ border: '1px solid var(--hairline)' }}
          >
            <Lock
              size={16}
              className="mt-0.5 shrink-0 text-ink-500 dark:text-ink-400"
              aria-hidden="true"
            />
            <p className="text-meta leading-snug text-ink-600 dark:text-ink-300">
              {t('auth.notSetUpBody')}
            </p>
          </div>
          <p className="mt-3 text-meta leading-snug text-ink-500 dark:text-ink-400">
            {t('auth.notSetUpHint')}
          </p>
          <button type="button" onClick={onClose} className="btn-quiet mt-4 w-full">
            {t('auth.carryOn')}
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t(stage === 'sent' ? 'auth.checkEmail' : 'auth.signIn')}
      description={stage === 'sent' ? undefined : t('auth.signInSubtitle')}
    >
      {stage === 'sent' ? (
        <div className="pb-6 pt-2">
          <p className="flex h-12 w-12 items-center justify-center rounded-full bg-mint-soft text-brand dark:bg-brand-mid dark:text-white">
            <EnvelopeSimple size={24} aria-hidden="true" />
          </p>
          <p className="mt-3 break-words text-base leading-snug text-ink-800 dark:text-ink-100">
            {t('auth.linkSent', { email: email.trim() })}
          </p>
          <p className="mt-3 text-meta leading-snug text-ink-500 dark:text-ink-400">
            {t('auth.spamHint')}
          </p>
          <div className="mt-4 grid gap-2.5">
            <button type="button" onClick={() => setStage('form')} className="btn-quiet w-full">
              {t('auth.differentAddress')}
            </button>
            <button type="button" onClick={onClose} className="btn-quiet w-full">
              {t('common.close')}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="pb-6 pt-1">
          <label htmlFor="auth-email" className="label">
            {t('auth.email')}
          </label>
          <input
            id="auth-email"
            data-autofocus
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            placeholder="you@example.com"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="off"
            spellCheck={false}
            required
            aria-describedby={error ? 'auth-error' : 'auth-help'}
            aria-invalid={error ? true : undefined}
            className="field"
          />

          {error ? (
            <p
              id="auth-error"
              role="alert"
              className="mt-2 text-meta font-medium leading-snug text-coral-text dark:text-[#F0B49B]"
            >
              {t(error)}
            </p>
          ) : (
            <p id="auth-help" className="mt-2 text-meta leading-snug text-ink-500 dark:text-ink-400">
              {t('auth.emailHelp')}
            </p>
          )}

          <button type="submit" disabled={stage === 'sending'} className="btn-primary mt-4">
            <PaperPlaneTilt size={18} aria-hidden="true" />
            {t(stage === 'sending' ? 'auth.sending' : 'auth.emailMe')}
          </button>

          <p className="mt-4 text-meta leading-snug text-ink-500 dark:text-ink-400">
            {t('auth.importHint')}
          </p>
        </form>
      )}
    </Sheet>
  );
}
