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

export async function createRoom(playerName: string): Promise<{ roomCode: string; playerId: string }> {
  return request('/rooms', {
    method: 'POST',
    body: JSON.stringify({ playerName }),
  });
}

export async function joinRoom(code: string, playerName: string): Promise<{ roomCode: string; playerId: string }> {
  return request(`/rooms/${code.toUpperCase()}/join`, {
    method: 'POST',
    body: JSON.stringify({ playerName }),
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
}

export async function listGames(): Promise<{ games: GameListItem[] }> {
  return request('/games');
}

export async function getGame(filename: string): Promise<any> {
  return request(`/games/${encodeURIComponent(filename)}`);
}
