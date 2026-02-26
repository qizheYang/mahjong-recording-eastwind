import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerUser } from '../lib/api';
import { useUserStore } from '../stores/user-store';
import { useLocale } from '../i18n';

export function RegisterPage() {
  const navigate = useNavigate();
  const { t } = useLocale();
  const setFromRegister = useUserStore(s => s.setFromRegister);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = username.trim() && email.trim() && phone.trim();

  async function handleRegister() {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    try {
      const res = await registerUser(username.trim(), email.trim(), phone.trim());
      if (res.token) {
        setFromRegister(res.token, res.username);
      }
      navigate('/');
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
            <label className="block text-sm text-mahjong-muted mb-1">{t('user.email')}</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-mahjong-card border border-mahjong-accent
                text-white text-lg focus:outline-none focus:border-mahjong-highlight"
              placeholder={t('user.emailPlaceholder')}
            />
          </div>
          <div>
            <label className="block text-sm text-mahjong-muted mb-1">{t('user.phone')}</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRegister()}
              className="w-full px-4 py-3 rounded-lg bg-mahjong-card border border-mahjong-accent
                text-white text-lg focus:outline-none focus:border-mahjong-highlight"
              placeholder={t('user.phonePlaceholder')}
            />
          </div>
          {error && <p className="text-mahjong-highlight text-sm">{error}</p>}
          <button
            onClick={handleRegister}
            disabled={loading || !canSubmit}
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
      </div>
    </div>
  );
}
