import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRoom, joinRoom, listLiveGames, type LiveGameSummary } from '../lib/api';
import { WIND_LABELS, type Wind } from '@mahjong/shared';
import { useGameStore } from '../stores/game-store';
import { useAdminStore } from '../stores/admin-store';

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
    if (!name.trim()) { setError('请输入名称'); return; }
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
    if (!adminUser.trim() || !adminPass.trim()) { setAdminError('请输入用户名和密码'); return; }
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
    if (!name.trim()) { setError('请输入名称'); return; }
    if (!roomCode.trim()) { setError('请输入房间号'); return; }
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
          <h1 className="text-4xl font-bold mb-2">🀄 麻雀記録</h1>
          <p className="text-mahjong-muted text-sm">Riichi Mahjong Recorder</p>
          <p className="text-mahjong-muted text-xs mt-1">M-League Rules</p>
        </div>

        {mode === 'menu' && (
          <div className="space-y-3">
            <button
              onClick={() => setMode('create')}
              className="w-full py-4 rounded-xl bg-mahjong-highlight text-white font-bold text-lg
                active:scale-[0.98] transition-transform"
            >
              创建房间 Create Room
            </button>
            <button
              onClick={() => setMode('join')}
              className="w-full py-4 rounded-xl bg-mahjong-accent text-white font-bold text-lg
                active:scale-[0.98] transition-transform"
            >
              加入房间 Join Room
            </button>
            <button
              onClick={() => navigate('/history')}
              className="w-full py-3 rounded-xl bg-mahjong-card text-mahjong-muted font-medium
                active:scale-[0.98] transition-transform border border-mahjong-accent"
            >
              对局记录 Game History
            </button>
            <button
              onClick={() => navigate('/history?tab=players')}
              className="w-full py-3 rounded-xl bg-mahjong-card text-mahjong-muted font-medium
                active:scale-[0.98] transition-transform border border-mahjong-accent"
            >
              玩家统计 Player Stats
            </button>

            {/* Live games section */}
            {liveGames.length > 0 && (
              <div className="pt-3 space-y-2">
                <h2 className="text-sm font-medium text-mahjong-muted text-center">
                  进行中 Live Games
                </h2>
                {liveGames.map(g => (
                  <div key={g.roomCode} className="bg-mahjong-card rounded-lg p-3 border border-mahjong-accent">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-mahjong-gold font-bold">{g.roomCode}</span>
                      <span className="text-xs text-mahjong-muted">
                        {g.status === 'waiting' ? `等待中 ${g.playerNames.length}/4` : g.status === 'playing' ? '对局中' : '已结束'}
                      </span>
                    </div>
                    {g.status === 'playing' && g.gameInfo ? (
                      <div>
                        <p className="text-xs text-mahjong-muted mb-1">
                          {WIND_LABELS[g.gameInfo.currentRound.wind as Wind]}{g.gameInfo.currentRound.number}局
                          {' · '}第{g.gameInfo.handCount + 1}手
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
                  <span>管理员 {adminUsername}</span>
                  <button
                    onClick={adminSignOut}
                    className="text-mahjong-highlight underline"
                  >
                    登出 Sign Out
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAdmin(true)}
                  className="w-full py-2 text-mahjong-muted/60 text-xs"
                >
                  管理员登录 Admin Sign In
                </button>
              )}
            </div>
          </div>
        )}

        {/* Admin sign in modal */}
        {showAdmin && !adminToken && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-mahjong-card rounded-xl p-6 w-full max-w-xs space-y-4">
              <h2 className="text-lg font-bold text-center">管理员登录 Admin</h2>
              <input
                type="text"
                value={adminUser}
                onChange={e => setAdminUser(e.target.value)}
                placeholder="用户名 Username"
                autoFocus
                className="w-full px-3 py-2 rounded-lg bg-mahjong-bg border border-mahjong-accent
                  text-white focus:outline-none focus:border-mahjong-highlight"
              />
              <input
                type="password"
                value={adminPass}
                onChange={e => setAdminPass(e.target.value)}
                placeholder="密码 Password"
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
                {adminLoading ? '登录中...' : '登录 Sign In'}
              </button>
              <button
                onClick={() => { setShowAdmin(false); setAdminError(''); }}
                className="w-full py-1 text-mahjong-muted text-sm"
              >
                取消 Cancel
              </button>
            </div>
          </div>
        )}

        {mode === 'create' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-mahjong-muted mb-1">你的名称 Your Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={12}
                autoFocus
                className="w-full px-4 py-3 rounded-lg bg-mahjong-card border border-mahjong-accent
                  text-white text-lg focus:outline-none focus:border-mahjong-highlight"
                placeholder="输入名称..."
              />
            </div>
            <div>
              <label className="block text-sm text-mahjong-muted mb-1">手机号 Phone (optional)</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                maxLength={20}
                className="w-full px-4 py-3 rounded-lg bg-mahjong-card border border-mahjong-accent
                  text-white text-lg focus:outline-none focus:border-mahjong-highlight"
                placeholder="可选..."
              />
            </div>
            {error && <p className="text-mahjong-highlight text-sm">{error}</p>}
            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-mahjong-highlight text-white font-bold text-lg
                disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {loading ? '创建中...' : '创建 Create'}
            </button>
            <button
              onClick={() => { setMode('menu'); setError(''); }}
              className="w-full py-2 text-mahjong-muted text-sm"
            >
              返回 Back
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-mahjong-muted mb-1">房间号 Room Code</label>
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
              <label className="block text-sm text-mahjong-muted mb-1">你的名称 Your Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={12}
                className="w-full px-4 py-3 rounded-lg bg-mahjong-card border border-mahjong-accent
                  text-white text-lg focus:outline-none focus:border-mahjong-highlight"
                placeholder="输入名称..."
              />
            </div>
            <div>
              <label className="block text-sm text-mahjong-muted mb-1">手机号 Phone (optional)</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                maxLength={20}
                className="w-full px-4 py-3 rounded-lg bg-mahjong-card border border-mahjong-accent
                  text-white text-lg focus:outline-none focus:border-mahjong-highlight"
                placeholder="可选..."
              />
            </div>
            {error && <p className="text-mahjong-highlight text-sm">{error}</p>}
            <button
              onClick={handleJoin}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-mahjong-accent text-white font-bold text-lg
                disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {loading ? '加入中...' : '加入 Join'}
            </button>
            <button
              onClick={() => { setMode('menu'); setError(''); }}
              className="w-full py-2 text-mahjong-muted text-sm"
            >
              返回 Back
            </button>
          </div>
        )}
      </div>
      <p className="absolute bottom-4 text-mahjong-muted/50 text-[10px] font-mono">
        v{__APP_VERSION__} ({__GIT_HASH__}) | {__BUILD_TIME__.replace('T', ' ').slice(0, 19)} UTC
      </p>
    </div>
  );
}
