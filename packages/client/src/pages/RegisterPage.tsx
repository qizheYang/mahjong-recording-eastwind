import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerUser } from '../lib/api';
import { useLocale } from '../i18n';

type Step = 'form' | 'success';

function getReturnPath(): string {
  const roomCode = sessionStorage.getItem('roomCode');
  if (!roomCode) return '/';
  // Check if there's an active game or lobby to return to
  const game = sessionStorage.getItem('playerId');
  if (game) return `/game/${roomCode}`;
  return '/';
}

export function RegisterPage() {
  const navigate = useNavigate();
  const { t } = useLocale();
  const [step, setStep] = useState<Step>('form');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleRegister() {
    if (!username.trim()) return;
    setLoading(true);
    setError('');
    try {
      await registerUser(username.trim());
      setStep('success');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-bold text-center">{t('user.registerTitle')}</h1>

        {step === 'form' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-mahjong-muted mb-1">{t('user.gongshizhanId')}</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                maxLength={20}
                autoFocus
                className="w-full px-4 py-3 rounded-lg bg-mahjong-card border border-mahjong-accent
                  text-white text-lg focus:outline-none focus:border-mahjong-highlight"
                placeholder={t('user.gongshizhanId')}
              />
            </div>
            {error && <p className="text-mahjong-highlight text-sm">{error}</p>}
            <button
              onClick={handleRegister}
              disabled={loading || !username.trim()}
              className="w-full py-3 rounded-xl bg-mahjong-highlight text-white font-bold text-lg
                disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {loading ? t('common.loading') : t('user.register')}
            </button>
            <button
              onClick={() => navigate(getReturnPath())}
              className="w-full py-2 text-mahjong-muted text-sm"
            >
              {t('common.back')}
            </button>
          </div>
        )}

        {step === 'success' && (
          <div className="space-y-4 text-center">
            <p className="text-mahjong-green text-lg font-bold">{t('user.registerSuccess')}</p>
            <button
              onClick={() => navigate(getReturnPath())}
              className="w-full py-3 rounded-xl bg-mahjong-accent text-white font-bold text-lg
                active:scale-[0.98] transition-transform"
            >
              {t('common.backToHome')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
