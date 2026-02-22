import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerUser, verifyEmail, resendOtp } from '../lib/api';
import { useLocale } from '../i18n';

type Step = 'form' | 'verify' | 'success';

export function RegisterPage() {
  const navigate = useNavigate();
  const { t } = useLocale();
  const [step, setStep] = useState<Step>('form');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleRegister() {
    if (!username.trim()) return;
    setLoading(true);
    setError('');
    try {
      await registerUser(username.trim(), email.trim());
      setStep('verify');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    try {
      await verifyEmail(email.trim(), code.trim());
      setStep('success');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setLoading(true);
    setError('');
    try {
      await resendOtp(email.trim());
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
            <div>
              <label className="block text-sm text-mahjong-muted mb-1">
                {t('user.email')}
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                maxLength={100}
                className="w-full px-4 py-3 rounded-lg bg-mahjong-card border border-mahjong-accent
                  text-white text-lg focus:outline-none focus:border-mahjong-highlight"
                placeholder="email@example.com"
              />
            </div>
            {error && <p className="text-mahjong-highlight text-sm">{error}</p>}
            <button
              onClick={handleRegister}
              disabled={loading || !username.trim() || !email.trim()}
              className="w-full py-3 rounded-xl bg-mahjong-highlight text-white font-bold text-lg
                disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {loading ? t('common.loading') : t('user.register')}
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full py-2 text-mahjong-muted text-sm"
            >
              {t('common.back')}
            </button>
          </div>
        )}

        {step === 'verify' && (
          <div className="space-y-4">
            <p className="text-sm text-mahjong-muted text-center">
              {t('user.codeSent', { email })}
            </p>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              autoFocus
              className="w-full px-4 py-3 rounded-lg bg-mahjong-card border border-mahjong-accent
                text-white text-2xl text-center tracking-[0.5em] font-mono
                focus:outline-none focus:border-mahjong-highlight"
              placeholder="______"
            />
            {error && <p className="text-mahjong-highlight text-sm">{error}</p>}
            <button
              onClick={handleVerify}
              disabled={loading || code.length !== 6}
              className="w-full py-3 rounded-xl bg-mahjong-green text-mahjong-bg font-bold text-lg
                disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {loading ? t('user.verifying') : t('user.verifyCode')}
            </button>
            <button
              onClick={handleResend}
              disabled={loading}
              className="w-full py-2 text-mahjong-muted text-sm"
            >
              {t('user.resendCode')}
            </button>
            <button
              onClick={() => { setStep('form'); setError(''); setCode(''); }}
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
              onClick={() => navigate('/')}
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
