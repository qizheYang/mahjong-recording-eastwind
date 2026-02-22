import { config } from '../config';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${config.apiUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }

  return data as T;
}

export async function createRoom(playerName: string, phone?: string): Promise<{ roomCode: string; playerId: string }> {
  return request('/rooms', {
    method: 'POST',
    body: JSON.stringify({ playerName, ...(phone ? { phone } : {}) }),
  });
}

export async function joinRoom(code: string, playerName: string, phone?: string): Promise<{ roomCode: string; playerId: string }> {
  return request(`/rooms/${code.toUpperCase()}/join`, {
    method: 'POST',
    body: JSON.stringify({ playerName, ...(phone ? { phone } : {}) }),
  });
}

export async function addPlayer(code: string, playerName: string, phone?: string): Promise<{ roomCode: string; playerId: string }> {
  return request(`/rooms/${code.toUpperCase()}/add-player`, {
    method: 'POST',
    body: JSON.stringify({ playerName, ...(phone ? { phone } : {}) }),
  });
}

export async function removePlayer(code: string, playerId: string): Promise<{ ok: boolean }> {
  return request(`/rooms/${code.toUpperCase()}/remove-player`, {
    method: 'POST',
    body: JSON.stringify({ playerId }),
  });
}

export async function killRoom(code: string, playerId: string): Promise<{ ok: boolean }> {
  return request(`/rooms/${code.toUpperCase()}?playerId=${encodeURIComponent(playerId)}`, {
    method: 'DELETE',
  });
}

export async function adminKillRoom(token: string, code: string): Promise<{ ok: boolean }> {
  return request(`/rooms/${code.toUpperCase()}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function resetRoom(code: string): Promise<void> {
  return request(`/rooms/${code}/reset`, { method: 'POST' });
}

export interface LiveGameSummary {
  roomCode: string;
  status: 'waiting' | 'playing' | 'finished';
  playerNames: string[];
  gameInfo: {
    currentRound: { wind: string; number: number };
    handCount: number;
    honbaCount: number;
    riichiSticks: number;
    playerPoints: { name: string; points: number }[];
  } | null;
}

export async function listLiveGames(): Promise<{ games: LiveGameSummary[] }> {
  return request('/live-games');
}

export interface GameListItem {
  filename: string;
  date: string;
  roomCode: string;
  players: string;
  tags: string[];
  isOfficialGame: boolean;
  interrupted: boolean;
  finalScores: { placement: number; name: string; rawPoints: number; gameScore: number }[];
}

export async function listGames(): Promise<{ games: GameListItem[] }> {
  return request('/games');
}

export async function getGame(filename: string): Promise<any> {
  return request(`/games/${encodeURIComponent(filename)}`);
}

// Player database
export interface PlayerGameEntry {
  filename: string;
  date: string;
  placement: number;
  rawPoints: number;
  gameScore: number;
  playerNames: string[];
  tags: string[];
}

export interface PlayerRecord {
  name: string;
  phone?: string;
  games: PlayerGameEntry[];
  totalGames: number;
  avgPlacement: number;
  avgGameScore: number;
  isRegistered?: boolean;
}

export async function listPlayerRecords(query?: string): Promise<{ players: PlayerRecord[] }> {
  const q = query ? `?q=${encodeURIComponent(query)}` : '';
  return request(`/players${q}`);
}

export async function getPlayerRecord(name: string): Promise<PlayerRecord> {
  return request(`/players/${encodeURIComponent(name)}`);
}

export async function rebuildPlayerDB(): Promise<{ rebuilt: number }> {
  return request('/players/rebuild', { method: 'POST' });
}

// Admin API
export interface AdminAnnotations {
  isOfficialGame: boolean;
  notes: string;
  annotatedBy: string;
  annotatedAt: string;
}

export async function adminSignIn(username: string, password: string): Promise<{ token: string; username: string }> {
  return request('/admin/signin', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function adminGetMe(token: string): Promise<{ username: string }> {
  return request('/admin/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getGameAnnotations(token: string, filename: string): Promise<{ annotations: AdminAnnotations | null }> {
  return request(`/admin/games/${encodeURIComponent(filename)}/annotations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function updateGameAnnotations(
  token: string,
  filename: string,
  data: { isOfficialGame: boolean; notes: string }
): Promise<{ annotations: AdminAnnotations }> {
  return request(`/admin/games/${encodeURIComponent(filename)}/annotations`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

// Tag management
export async function listTags(): Promise<{ tags: string[] }> {
  return request('/tags');
}

export async function createTag(name: string): Promise<{ tag: string }> {
  return request('/tags', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function adminDeleteTag(token: string, name: string): Promise<{ deleted: string }> {
  return request(`/tags/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function adminUpdateGameTags(
  token: string,
  filename: string,
  tags: string[]
): Promise<{ tags: string[] }> {
  return request(`/admin/games/${encodeURIComponent(filename)}/tags`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tags }),
  });
}

// User registration
export interface RegisteredUser {
  id: string;
  username: string;
  email: string;
}

export async function registerUser(username: string, email: string): Promise<{ id: string; username: string; email: string; needsVerification: boolean }> {
  return request('/users/register', {
    method: 'POST',
    body: JSON.stringify({ username, email }),
  });
}

export async function verifyEmail(email: string, code: string): Promise<{ verified: boolean }> {
  return request('/users/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
}

export async function resendOtp(email: string): Promise<{ codeSent: boolean }> {
  return request('/users/resend-otp', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function listRegisteredUsers(): Promise<{ users: RegisteredUser[] }> {
  return request('/users');
}

export async function searchRegisteredUsers(q: string): Promise<{ users: RegisteredUser[] }> {
  return request(`/users/search?q=${encodeURIComponent(q)}`);
}
