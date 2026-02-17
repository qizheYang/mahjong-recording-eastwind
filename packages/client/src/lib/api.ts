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

export async function resetRoom(code: string): Promise<void> {
  return request(`/rooms/${code}/reset`, { method: 'POST' });
}

export interface GameListItem {
  filename: string;
  date: string;
  roomCode: string;
  players: string;
  tags: string[];
  isOfficialGame: boolean;
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
