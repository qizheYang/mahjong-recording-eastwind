import type { WSContext, WSMessageReceive } from 'hono/ws';
import type { ClientEvent, ServerEvent } from '@mahjong/shared';
import { roomManager } from './room-manager.js';

interface ConnectionContext {
  roomCode: string;
  playerId: string;
}

const connectionCtx = new WeakMap<WSContext, ConnectionContext>();

export function handleWSOpen(ws: WSContext, roomCode: string, playerId: string): void {
  connectionCtx.set(ws, { roomCode, playerId });

  const room = roomManager.connectPlayer(roomCode, playerId, ws);
  if (!room) {
    sendError(ws, '无法加入房间 (Cannot join room)', 'INVALID_ROOM');
    ws.close(4001, 'Invalid room or player');
    return;
  }

  // Send current room state to the connecting player
  const event: ServerEvent = { type: 'room_state', room };
  ws.send(JSON.stringify(event));

  // Notify others
  const player = room.players.find(p => p.id === playerId);
  if (player) {
    roomManager.broadcast(roomCode, { type: 'player_joined', player }, playerId);
  }
}

export function handleWSMessage(ws: WSContext, data: WSMessageReceive): void {
  const ctx = connectionCtx.get(ws);
  if (!ctx) return;

  let event: ClientEvent;
  try {
    const raw = typeof data === 'string' ? data : data.toString();
    event = JSON.parse(raw);
  } catch {
    sendError(ws, '无效消息格式 (Invalid message format)', 'PARSE_ERROR');
    return;
  }

  const { roomCode } = ctx;

  switch (event.type) {
    case 'start_game': {
      const result = roomManager.startGame(roomCode, event.seatOrder);
      if ('error' in result) {
        sendError(ws, result.error, 'START_ERROR');
        return;
      }
      roomManager.broadcast(roomCode, { type: 'game_started', game: result });
      break;
    }

    case 'record_hand': {
      const result = roomManager.recordHand(roomCode, event.result);
      if ('error' in result) {
        sendError(ws, result.error, 'RECORD_ERROR');
        return;
      }

      const { hand, game } = result;

      if (game.status === 'completed') {
        // Game ended naturally (All Last conditions met)
        const finalScores = roomManager.getGameFinalScores(roomCode);
        roomManager.broadcast(roomCode, {
          type: 'game_ended',
          game,
          finalScores: finalScores ?? [],
        });
      } else {
        roomManager.broadcast(roomCode, { type: 'hand_recorded', hand, game });
      }
      break;
    }

    case 'undo_last_hand': {
      const result = roomManager.undoHand(roomCode);
      if ('error' in result) {
        sendError(ws, result.error, 'UNDO_ERROR');
        return;
      }
      roomManager.broadcast(roomCode, { type: 'hand_undone', game: result });
      break;
    }

    case 'end_game': {
      const result = roomManager.endGame(roomCode);
      if ('error' in result) {
        sendError(ws, result.error, 'END_ERROR');
        return;
      }
      roomManager.broadcast(roomCode, {
        type: 'game_ended',
        game: result.game,
        finalScores: result.finalScores,
      });
      break;
    }

    case 'leave_room': {
      roomManager.removePlayer(roomCode, ctx.playerId);
      connectionCtx.delete(ws);
      ws.close(1000, 'Left room');
      break;
    }

    default:
      sendError(ws, '未知事件类型 (Unknown event type)', 'UNKNOWN_EVENT');
  }
}

export function handleWSClose(ws: WSContext): void {
  const ctx = connectionCtx.get(ws);
  if (!ctx) return;
  roomManager.disconnectPlayer(ctx.roomCode, ctx.playerId);
  connectionCtx.delete(ws);
}

function sendError(ws: WSContext, message: string, code: string): void {
  const event: ServerEvent = { type: 'error', message, code };
  try {
    ws.send(JSON.stringify(event));
  } catch {
    // ignore
  }
}
