import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRoom, joinRoom, listLiveGames, type LiveGameSummary } from '../lib/api';
import type { Wind } from '@mahjong/shared';
import { useGameStore } from '../stores/game-store';
import { useAdminStore } from '../stores/admin-store';
import { useLocale } from '../i18n';

export function HomePage() {
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const navigate = useNavigate();
  const setSession = useGameStore(s => s.setSession);
  const { token: adminToken, username: adminUsername, signIn: adminSignIn, signOut: adminSignOut, checkAuth } = useAdminStore();
  const { t } = useLocale();

  const [liveGames, setLiveGames] = useState<LiveGameSummary[]>([]);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  useEffect(() => {
    let cancelled = false;
    async function fetchLive() {
      try {
        const res = await listLiveGames();
        if (!cancelled) setLiveGames(res.games);
      } catch { /* ignore */ }
    }
    fetchLive();
    const interval = setInterval(fetchLive, 10_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  async function handleCreate() {
    if (!name.trim()) { setError(t('validation.enterName')); return; }
    setLoading(true);
    setError('');
    try {
      const res = await createRoom(name.trim(), phone.trim() || undefined);
      setSession(res.roomCode, res.playerId);
      navigate(`/lobby/${res.roomCode}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdminSignIn() {
    if (!adminUser.trim() || !adminPass.trim()) { setAdminError(t('validation.enterCredentials')); return; }
    setAdminLoading(true);
    setAdminError('');
    try {
      await adminSignIn(adminUser.trim(), adminPass.trim());
      setShowAdmin(false);
      setAdminUser('');
      setAdminPass('');
    } catch (e: any) {
      setAdminError(e.message);
    } finally {
      setAdminLoading(false);
    }
  }

  async function handleJoin() {
    if (!name.trim()) { setError(t('validation.enterName')); return; }
    if (!roomCode.trim()) { setError(t('validation.enterRoomCode')); return; }
    setLoading(true);
    setError('');
    try {
      const res = await joinRoom(roomCode.trim(), name.trim(), phone.trim() || undefined);
      setSession(res.roomCode, res.playerId);
      navigate(`/lobby/${res.roomCode}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-4 relative">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">{t('home.title')}</h1>
          <p className="text-mahjong-muted text-sm">{t('home.subtitle')}</p>
          <p className="text-mahjong-muted text-xs mt-1">{t('home.mLeague')}</p>
        </div>

        {mode === 'menu' && (
          <div className="space-y-3">
            <button
              onClick={() => setMode('create')}
              className="w-full py-4 rounded-xl bg-mahjong-highlight text-white font-bold text-lg
                active:scale-[0.98] transition-transform"
            >
              {t('home.createRoom')}
            </button>
            <button
              onClick={() => setMode('join')}
              className="w-full py-4 rounded-xl bg-mahjong-accent text-white font-bold text-lg
                active:scale-[0.98] transition-transform"
            >
              {t('home.joinRoom')}
            </button>
            <button
              onClick={() => navigate('/history')}
              className="w-full py-3 rounded-xl bg-mahjong-card text-mahjong-muted font-medium
                active:scale-[0.98] transition-transform border border-mahjong-accent"
            >
              {t('home.gameHistory')}
            </button>
            <button
              onClick={() => navigate('/history?tab=players')}
              className="w-full py-3 rounded-xl bg-mahjong-card text-mahjong-muted font-medium
                active:scale-[0.98] transition-transform border border-mahjong-accent"
            >
              {t('home.playerStats')}
            </button>

            {/* Live games section */}
            {liveGames.length > 0 && (
              <div className="pt-3 space-y-2">
                <h2 className="text-sm font-medium text-mahjong-muted text-center">
                  {t('home.liveGames')}
                </h2>
                {liveGames.map(g => (
                  <div key={g.roomCode} className="bg-mahjong-card rounded-lg p-3 border border-mahjong-accent">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-mahjong-gold font-bold">{g.roomCode}</span>
                      <span className="text-xs text-mahjong-muted">
                        {g.status === 'waiting' ? t('home.waitingCount', { n: g.playerNames.length }) : g.status === 'playing' ? t('home.playing') : t('home.finished')}
                      </span>
                    </div>
                    {g.status === 'playing' && g.gameInfo ? (
                      <div>
                        <p className="text-xs text-mahjong-muted mb-1">
                          {t(`mahjong.wind.${g.gameInfo.currentRound.wind}`)}{g.gameInfo.currentRound.number}{t('mahjong.round')}
                          {' · '}{t('home.handNumber', { n: g.gameInfo.handCount + 1 })}
                        </p>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                          {g.gameInfo.playerPoints.map(p => (
                            <div key={p.name} className="flex justify-between text-xs">
                              <span className="text-white truncate">{p.name}</span>
                              <span className={p.points >= 25000 ? 'text-mahjong-green' : 'text-mahjong-highlight'}>
                                {p.points.toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-white">
                        {g.playerNames.join(', ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Admin section */}
            <div className="pt-2">
              {adminToken ? (
                <div className="flex items-center justify-center gap-2 text-xs text-mahjong-muted">
                  <span>{t('home.adminUser', { name: adminUsername ?? '' })}</span>
                  <button
                    onClick={adminSignOut}
                    className="text-mahjong-highlight underline"
                  >
                    {t('home.signOut')}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAdmin(true)}
                  className="w-full py-2 text-mahjong-muted/60 text-xs"
                >
                  {t('home.adminSignIn')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Admin sign in modal */}
        {showAdmin && !adminToken && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-mahjong-card rounded-xl p-6 w-full max-w-xs space-y-4">
              <h2 className="text-lg font-bold text-center">{t('home.adminSignIn')}</h2>
              <input
                type="text"
                value={adminUser}
                onChange={e => setAdminUser(e.target.value)}
                placeholder={t('home.username')}
                autoFocus
                className="w-full px-3 py-2 rounded-lg bg-mahjong-bg border border-mahjong-accent
                  text-white focus:outline-none focus:border-mahjong-highlight"
              />
              <input
                type="password"
                value={adminPass}
                onChange={e => setAdminPass(e.target.value)}
                placeholder={t('home.password')}
                onKeyDown={e => e.key === 'Enter' && handleAdminSignIn()}
                className="w-full px-3 py-2 rounded-lg bg-mahjong-bg border border-mahjong-accent
                  text-white focus:outline-none focus:border-mahjong-highlight"
              />
              {adminError && <p className="text-mahjong-highlight text-xs">{adminError}</p>}
              <button
                onClick={handleAdminSignIn}
                disabled={adminLoading}
                className="w-full py-2 rounded-lg bg-mahjong-accent text-white font-bold
                  disabled:opacity-50"
              >
                {adminLoading ? t('home.signingIn') : t('home.signIn')}
              </button>
              <button
                onClick={() => { setShowAdmin(false); setAdminError(''); }}
                className="w-full py-1 text-mahjong-muted text-sm"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}

        {mode === 'create' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-mahjong-muted mb-1">{t('home.yourName')}</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={12}
                autoFocus
                className="w-full px-4 py-3 rounded-lg bg-mahjong-card border border-mahjong-accent
                  text-white text-lg focus:outline-none focus:border-mahjong-highlight"
                placeholder={t('home.enterName')}
              />
            </div>
            <div>
              <label className="block text-sm text-mahjong-muted mb-1">{t('home.phone')} ({t('home.phoneOptional')})</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                maxLength={20}
                className="w-full px-4 py-3 rounded-lg bg-mahjong-card border border-mahjong-accent
                  text-white text-lg focus:outline-none focus:border-mahjong-highlight"
                placeholder={t('home.phoneOptional')}
              />
            </div>
            {error && <p className="text-mahjong-highlight text-sm">{error}</p>}
            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-mahjong-highlight text-white font-bold text-lg
                disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {loading ? t('home.creating') : t('home.create')}
            </button>
            <button
              onClick={() => { setMode('menu'); setError(''); }}
              className="w-full py-2 text-mahjong-muted text-sm"
            >
              {t('common.back')}
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-mahjong-muted mb-1">{t('home.roomCode')}</label>
              <input
                type="text"
                value={roomCode}
                onChange={e => setRoomCode(e.target.value.toUpperCase())}
                maxLength={4}
                autoFocus
                className="w-full px-4 py-3 rounded-lg bg-mahjong-card border border-mahjong-accent
                  text-white text-2xl text-center tracking-[0.5em] font-mono uppercase
                  focus:outline-none focus:border-mahjong-highlight"
                placeholder="____"
              />
            </div>
            <div>
              <label className="block text-sm text-mahjong-muted mb-1">{t('home.yourName')}</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={12}
                className="w-full px-4 py-3 rounded-lg bg-mahjong-card border border-mahjong-accent
                  text-white text-lg focus:outline-none focus:border-mahjong-highlight"
                placeholder={t('home.enterName')}
              />
            </div>
            <div>
              <label className="block text-sm text-mahjong-muted mb-1">{t('home.phone')} ({t('home.phoneOptional')})</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                maxLength={20}
                className="w-full px-4 py-3 rounded-lg bg-mahjong-card border border-mahjong-accent
                  text-white text-lg focus:outline-none focus:border-mahjong-highlight"
                placeholder={t('home.phoneOptional')}
              />
            </div>
            {error && <p className="text-mahjong-highlight text-sm">{error}</p>}
            <button
              onClick={handleJoin}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-mahjong-accent text-white font-bold text-lg
                disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {loading ? t('home.joining') : t('home.join')}
            </button>
            <button
              onClick={() => { setMode('menu'); setError(''); }}
              className="w-full py-2 text-mahjong-muted text-sm"
            >
              {t('common.back')}
            </button>
          </div>
        )}
      </div>
      <div className="absolute bottom-4 flex flex-col items-center gap-1">
        <p className="text-mahjong-muted/50 text-[10px] font-mono">
          v{__APP_VERSION__} ({__GIT_HASH__}) | {__BUILD_TIME__.replace('T', ' ').slice(0, 19)} UTC
        </p>
        <a href="https://yangqizhe.com" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-mahjong-muted/50 hover:text-mahjong-muted transition-colors text-[10px]">
          <svg viewBox="73 69 444 444" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round">
            <path d="M274.57 144.49 269.09 145.36 263.64 146.45 258.24 147.74 252.89 149.22 247.6 150.91 242.37 152.8 237.22 154.88 232.16 157.16 227.18 159.62 222.3 162.26 217.52 165.09 212.85 168.1 208.3 171.28 203.87 174.63 199.56 178.14 195.4 181.81 191.37 185.64 187.49 189.61 183.76 193.73 180.19 197.98 176.79 202.37 173.54 206.88 170.48 211.5 167.58 216.25 164.87 221.09 162.34 226.04 160 231.07 157.85 236.19 155.89 241.39 154.13 246.66 152.57 251.98 151.21 257.37 150.05 262.8 149.1 268.27 148.35 273.78 147.81 279.3 147.48 284.85 147.36 290.4 147.45 295.95 147.74 301.5 148.24 307.03 148.95 312.54 149.87 318.01 150.99 323.45 152.32 328.85 153.84 334.19 155.57 339.46 157.49 344.67 159.61 349.81 161.92 354.86 164.42 359.82 167.1 364.68 169.96 369.44 173 374.09 176.21 378.62 179.59 383.03 183.13 387.3 186.83 391.45 190.69 395.44 194.69 399.3 198.83 402.99 203.11 406.54 207.52 409.91 212.05 413.12 216.7 416.16 221.46 419.02 226.33 421.7 231.29 424.19 236.34 426.5 241.48 428.61 246.69 430.53 251.97 432.26 257.31 433.78 262.7 435.1 268.14 436.22 273.62 437.14 279.13 437.84 284.66 438.34 290.2 438.64 295.76 438.72 301.31 438.59 306.85 438.26 312.38 437.72 317.88 436.97 323.35 436.01 328.78 434.86 334.17 433.49 339.5 431.93 344.76 430.16 349.96 428.21 355.08 426.05 360.11 423.71 365.05 421.18 369.9 418.46 374.64 415.56 379.26 412.49 383.77 409.25 388.16 405.84 392.41 402.27 396.52 398.54 400.5 394.66 404.32 390.63 407.99 386.46 411.5 382.16 414.84 377.72 418.02 373.17 421.03 368.5 423.85 363.72 426.5 358.83 428.96 353.86 431.23 348.79 433.31 343.64 435.19 338.41 436.88 333.12 438.36 327.77 439.65 322.37 440.73 316.92 441.6 311.44 442.27 305.92 442.73 300.39 442.99 294.84 443.03 289.29 442.87 283.74 442.49 278.2 441.91 272.67 441.13 267.18 440.13 261.71 438.94 256.29 437.54 250.91 435.93 245.6 434.13 240.34 432.14 235.16 429.95 230.06 427.57 225.04 425 220.11 422.25 215.29 419.32 210.57 416.22 205.96 412.95 201.48 409.51 197.12 405.9 192.89 402.15 188.8 398.24 184.86 394.18 181.06 389.99 177.42 385.66 173.94 381.2 170.63 376.63 167.48 371.93 164.51 367.13 161.72 362.23 159.11 357.24 156.69 352.15 154.45 346.99 152.41 341.75 150.56 336.45 148.91 331.09 147.46 325.67 146.21 320.22 145.17 315.83 144.49"/>
            <path d="M295.2 397.32V438.72"/>
            <path d="M392.27 334.56 394.16 330.08 395.85 325.52 397.33 320.89 398.59 316.19 399.64 311.45 400.47 306.66 401.08 301.84 401.47 296.99 401.64 292.13 401.58 287.27 401.31 282.42 400.81 277.58 400.09 272.78 399.16 268.01 398.01 263.29 396.64 258.62 395.06 254.02 393.27 249.5 391.28 245.07 389.09 240.73 386.7 236.5 384.13 232.37 381.36 228.38 378.42 224.51 375.3 220.78 372.02 217.19 368.57 213.76 364.98 210.49 361.23 207.39 357.35 204.47 353.34 201.72 349.21 199.16 344.97 196.79 340.62 194.61 336.18 192.64 331.65 190.87 327.05 189.31 322.38 187.96 317.65 186.83 312.88 185.91 308.07 185.22 303.23 184.74 298.37 184.48 293.51 184.45 288.66 184.64 283.81 185.05 278.99 185.68 274.21 186.53 269.47 187.59 264.78 188.88 260.15 190.37 255.6 192.08 251.13 193.99 246.75 196.1 242.48 198.41 238.31 200.91 234.26 203.6 230.34 206.48 226.56 209.53 222.91 212.75 219.42 216.13 216.09 219.66 212.92 223.35 209.92 227.18 207.1 231.14 204.47 235.22 202.02 239.42 199.77 243.73 197.71 248.13 195.87 252.63 194.22 257.2 192.79 261.85 191.57 266.56 190.57 271.31 189.79 276.11 189.22 280.94 188.88 285.79 188.76 290.64 188.86 295.5 189.18 300.35 189.72 305.18 190.48 309.99 191.47 314.75 192.66 319.46 194.07 324.11 195.7 328.69 197.53 333.19 199.56 337.61 201.79 341.93 204.22 346.14 206.84 350.23 209.64 354.21 212.62 358.05 215.77 361.75 219.09 365.3 222.57 368.69 226.2 371.93 229.97 374.99 233.88 377.89 237.91 380.59 242.07 383.12 246.33 385.45 250.7 387.58 255.16 389.51 259.71 391.23 264.33 392.75 269.01 394.05 273.75 395.14 278.53 396.01 283.35 396.66 288.19 397.09 293.04 397.3 297.9 397.29 302.76 397.06 307.6 396.6 312.41 395.92 317.19 395.03 321.92 393.92 326.6 392.59 331.21 391.05 335.74 389.3 340.19 387.35 344.55 385.19 348.81 382.84 352.95 380.3 356.97 377.57 360.86 374.66 364.62 371.57 368.23 368.32 371.69 364.9 374.99 361.34 378.12 357.62 381.08 353.76 381.56 353.11"/>
            <path d="M372.52 335.52 405.97 354.83"/>
            <path d="M356.33 313.13 357.48 309.66 358.43 306.14 359.19 302.57 359.75 298.96 360.1 295.33 360.24 291.68 360.19 288.03 359.92 284.39 359.46 280.77 358.79 277.18 357.92 273.63 356.85 270.14 355.59 266.71 354.14 263.36 352.51 260.1 350.69 256.93 348.7 253.87 346.54 250.93 344.21 248.11 341.74 245.43 339.12 242.89 336.35 240.5 333.46 238.27 330.45 236.21 327.33 234.32 324.1 232.61 320.79 231.08 317.39 229.73 313.93 228.59 310.4 227.63 306.83 226.88 303.22 226.33 299.59 225.98 295.94 225.83 292.29 225.9 288.65 226.16 285.03 226.63 281.44 227.3 277.9 228.17 274.41 229.24 270.98 230.51 267.63 231.96 264.37 233.6 261.2 235.42 258.15 237.42 255.21 239.58 252.39 241.9 249.71 244.38 247.17 247.01 245.37 249.07"/>
            <path d="M234.07 268.63 232.92 272.1 231.97 275.62 231.21 279.19 230.65 282.8 230.3 286.43 230.16 290.08 230.21 293.73 230.48 297.37 230.94 300.99 231.61 304.58 232.48 308.13 233.55 311.62 234.81 315.05 236.26 318.4 237.89 321.66 239.71 324.83 241.7 327.89 243.86 330.83 246.19 333.65 248.66 336.33 251.28 338.87 254.05 341.26 256.94 343.49 259.95 345.55 263.07 347.44 266.3 349.15 269.61 350.68 273.01 352.03 276.47 353.17 280 354.13 283.57 354.88 287.18 355.43 290.81 355.78 294.46 355.93 298.11 355.86 301.75 355.6 305.37 355.13 308.96 354.46 312.5 353.59 316 352.52 319.42 351.25 322.77 349.8 326.03 348.16 329.2 346.34 332.25 344.34 335.19 342.18 338.01 339.86 340.69 337.38 343.23 334.75 345.03 332.69"/>
            <path d="M356.33 313.13 317 290.42"/>
            <path d="M234.07 268.63 273.4 291.34"/>
          </svg>
          {t('home.byLine')}
        </a>
      </div>
    </div>
  );
}
