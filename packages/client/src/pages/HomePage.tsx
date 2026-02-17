import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRoom, joinRoom } from '../lib/api';
import { useGameStore } from '../stores/game-store';

export function HomePage() {
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setSession = useGameStore(s => s.setSession);

  async function handleCreate() {
    if (!name.trim()) { setError('请输入名称'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await createRoom(name.trim());
      setSession(res.roomCode, res.playerId);
      navigate(`/lobby/${res.roomCode}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!name.trim()) { setError('请输入名称'); return; }
    if (!roomCode.trim()) { setError('请输入房间号'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await joinRoom(roomCode.trim(), name.trim());
      setSession(res.roomCode, res.playerId);
      navigate(`/lobby/${res.roomCode}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-4">
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
    </div>
  );
}
