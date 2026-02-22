import type { WSContext, WSMessageReceive } from 'hono/ws';
import type { ClientEvent, ServerEvent, Game, FinalScore } from '@mahjong/shared';
import { roomManager } from './room-manager.js';
import { saveGameRecord, getGameRecord } from '../services/game-file-service.js';
import { updatePlayerDB } from '../services/player-db.js';

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
    case 'ready_toggle': {
      const result = roomManager.toggleReady(roomCode, ctx.playerId);
      if ('error' in result) {
        sendError(ws, result.error, 'READY_ERROR');
        return;
      }

      // Broadcast ready state change
      roomManager.broadcast(roomCode, {
        type: 'player_ready',
        playerId: ctx.playerId,
        ready: result.ready,
      });

      // Auto-start when all 4 players are ready
      if (result.allReady) {
        const room = roomManager.getRoom(roomCode);
        if (room) {
          // Use current player order as seat order
          const seatOrder = room.players.map(p => p.id);
          const game = roomManager.startGame(roomCode, seatOrder);
          if (!('error' in game)) {
            roomManager.broadcast(roomCode, { type: 'game_started', game });
          }
        }
      }
      break;
    }

    case 'swap_seats': {
      const result = roomManager.swapSeats(roomCode, event.playerIdA, event.playerIdB);
      if ('error' in result) {
        sendError(ws, result.error, 'SWAP_ERROR');
        return;
      }
      roomManager.broadcast(roomCode, { type: 'seats_swapped', players: result });
      break;
    }

    case 'start_game': {
      const result = roomManager.startGame(roomCode, event.seatOrder, event.ruleset, event.tags);
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
        // Save game record to JSON file
        const savedFilename = saveGameToFile(game, finalScores ?? []);
        roomManager.broadcast(roomCode, {
          type: 'game_ended',
          game,
          finalScores: finalScores ?? [],
          ...(savedFilename ? { savedFilename } : {}),
        });
      } else {
        roomManager.broadcast(roomCode, { type: 'hand_recorded', hand, game });
      }
      break;
    }

    case 'edit_hand': {
      const result = roomManager.editHand(roomCode, event.handNumber, event.result);
      if ('error' in result) {
        sendError(ws, result.error, 'RECORD_ERROR');
        return;
      }

      if (result.status === 'completed') {
        const finalScores = roomManager.getGameFinalScores(roomCode);
        const savedFilename = saveGameToFile(result, finalScores ?? []);
        roomManager.broadcast(roomCode, {
          type: 'game_ended',
          game: result,
          finalScores: finalScores ?? [],
          ...(savedFilename ? { savedFilename } : {}),
        });
      } else {
        roomManager.broadcast(roomCode, { type: 'hand_edited', game: result });
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

    case 'record_penalty': {
      const result = roomManager.recordGamePenalty(roomCode, event.penalty);
      if ('error' in result) {
        sendError(ws, result.error, 'RECORD_ERROR');
        return;
      }
      roomManager.broadcast(roomCode, { type: 'penalty_recorded', penalty: result.penalty, game: result.game });
      break;
    }

    case 'undo_penalty': {
      const result = roomManager.undoGamePenalty(roomCode);
      if ('error' in result) {
        sendError(ws, result.error, 'UNDO_ERROR');
        return;
      }
      roomManager.broadcast(roomCode, { type: 'penalty_undone', game: result });
      break;
    }

    case 'end_game': {
      const result = roomManager.endGame(roomCode);
      if ('error' in result) {
        sendError(ws, result.error, 'END_ERROR');
        return;
      }
      // Save game record to JSON file
      const savedFilename = saveGameToFile(result.game, result.finalScores);
      roomManager.broadcast(roomCode, {
        type: 'game_ended',
        game: result.game,
        finalScores: result.finalScores,
        ...(savedFilename ? { savedFilename } : {}),
      });
      break;
    }

    case 'force_quit_game': {
      const result = roomManager.endGame(roomCode);
      if ('error' in result) {
        sendError(ws, result.error, 'END_ERROR');
        return;
      }
      let savedFilename: string | null = null;
      if (event.keepRecord) {
        savedFilename = saveGameToFile(result.game, result.finalScores, { interrupted: true });
      }
      roomManager.broadcast(roomCode, {
        type: 'game_ended',
        game: result.game,
        finalScores: result.finalScores,
        ...(savedFilename ? { savedFilename } : {}),
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

function saveGameToFile(game: Game, finalScores: FinalScore[], options?: { interrupted?: boolean }): string | null {
  try {
    const filename = saveGameRecord(game, finalScores, options);
    // Update player database
    const record = getGameRecord(filename);
    if (record) {
      updatePlayerDB(record, filename);
    }
    return filename;
  } catch (err) {
    console.error('Failed to save game record:', err);
    return null;
  }
}

function sendError(ws: WSContext, message: string, code: string): void {
  const event: ServerEvent = { type: 'error', message, code };
  try {
    ws.send(JSON.stringify(event));
  } catch {
    // ignore
  }
}
