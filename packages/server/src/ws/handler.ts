import type { WSContext, WSMessageReceive } from 'hono/ws';
import type { ClientEvent, ServerEvent, Game, FinalScore, TeamScore } from '@mahjong/shared';
import { calculateTeamScores } from '@mahjong/shared';
import { roomManager } from './room-manager.js';
import { saveInProgressGame, finalizeGameRecord, getGameRecord } from '../services/game-file-service.js';
import { updatePlayerDB } from '../services/player-db.js';

interface ConnectionContext {
  roomCode: string;
  playerId: string;
  isHost: boolean;
  rateWindowStartedAt: number;
  messagesInWindow: number;
}

const MAX_WS_MESSAGE_BYTES = 64 * 1024;
const WS_RATE_WINDOW_MS = 10_000;
const MAX_WS_MESSAGES_PER_WINDOW = 100;

const connectionCtx = new WeakMap<WSContext, ConnectionContext>();

export function handleWSOpen(
  ws: WSContext,
  roomCode: string,
  playerId: string,
  playerCapability: string | undefined,
  hostCapability: string | undefined,
): void {
  const connection = roomManager.connectPlayer(
    roomCode,
    playerId,
    playerCapability,
    hostCapability,
    ws,
  );
  if (!connection) {
    sendError(ws, '无效或已过期的房间凭证 (Invalid or expired room credential)', 'INVALID_CAPABILITY');
    ws.close(4001, 'Invalid room or player');
    return;
  }
  connectionCtx.set(ws, {
    roomCode,
    playerId,
    isHost: connection.isHost,
    rateWindowStartedAt: Date.now(),
    messagesInWindow: 0,
  });
  const { room } = connection;

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

  // Handle heartbeat ping (plain text, not JSON)
  const raw = typeof data === 'string' ? data : data.toString();
  if (Buffer.byteLength(raw, 'utf8') > MAX_WS_MESSAGE_BYTES) {
    sendError(ws, '消息内容过大 (WebSocket payload too large)', 'PAYLOAD_TOO_LARGE');
    ws.close(1009, 'Message too large');
    return;
  }
  if (raw === 'ping') {
    try { ws.send('pong'); } catch { /* ignore */ }
    return;
  }

  if (!consumeMessageBudget(ctx)) {
    sendError(ws, '消息过于频繁 (Too many WebSocket messages)', 'RATE_LIMITED');
    ws.close(4008, 'Rate limit exceeded');
    return;
  }

  let event: ClientEvent;
  try {
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
            const savedFilename = autoSave(roomCode, game);
            roomManager.broadcast(roomCode, { type: 'game_started', game, ...(savedFilename ? { savedFilename } : {}) });
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
      if (!requireHost(ws, ctx)) return;
      const result = roomManager.startGame(roomCode, event.seatOrder, event.ruleset, event.tags, event.teams, event.playerStartingPoints);
      if ('error' in result) {
        sendError(ws, result.error, 'START_ERROR');
        return;
      }
      const savedFilename = autoSave(roomCode, result);
      roomManager.broadcast(roomCode, { type: 'game_started', game: result, ...(savedFilename ? { savedFilename } : {}) });
      break;
    }

    case 'record_hand': {
      const result = roomManager.recordHand(roomCode, event.result);
      if ('error' in result) {
        sendError(ws, result.error, 'RECORD_ERROR');
        return;
      }

      const { hand, game } = result;

      // Reset live riichi after each hand
      game.liveRiichi = [false, false, false, false];

      if (game.status === 'completed') {
        // Game ended naturally — finalize the saved file
        const savedFilename = finalizeGame(roomCode, game);
        const finalScores = roomManager.getGameFinalScores(roomCode);
        const teamScores = getTeamScores(game, finalScores ?? []);
        roomManager.broadcast(roomCode, {
          type: 'game_ended',
          game,
          finalScores: finalScores ?? [],
          ...(savedFilename ? { savedFilename } : {}),
          ...(teamScores ? { teamScores } : {}),
        });
      } else {
        const savedFilename = autoSave(roomCode, game);
        roomManager.broadcast(roomCode, { type: 'hand_recorded', hand, game, ...(savedFilename ? { savedFilename } : {}) });
      }
      break;
    }

    case 'edit_hand': {
      if (!requireHost(ws, ctx)) return;
      const result = roomManager.editHand(roomCode, event.handNumber, event.result);
      if ('error' in result) {
        sendError(ws, result.error, 'RECORD_ERROR');
        return;
      }

      result.liveRiichi = [false, false, false, false];

      if (result.status === 'completed') {
        const savedFilename = finalizeGame(roomCode, result);
        const finalScores = roomManager.getGameFinalScores(roomCode);
        const teamScores = getTeamScores(result, finalScores ?? []);
        roomManager.broadcast(roomCode, {
          type: 'game_ended',
          game: result,
          finalScores: finalScores ?? [],
          ...(savedFilename ? { savedFilename } : {}),
          ...(teamScores ? { teamScores } : {}),
        });
      } else {
        autoSave(roomCode, result);
        roomManager.broadcast(roomCode, { type: 'hand_edited', game: result });
      }
      break;
    }

    case 'undo_last_hand': {
      if (!requireHost(ws, ctx)) return;
      const result = roomManager.undoHand(roomCode);
      if ('error' in result) {
        sendError(ws, result.error, 'UNDO_ERROR');
        return;
      }
      result.liveRiichi = [false, false, false, false];
      autoSave(roomCode, result);
      roomManager.broadcast(roomCode, { type: 'hand_undone', game: result });
      break;
    }

    case 'record_penalty': {
      const result = roomManager.recordGamePenalty(roomCode, event.penalty);
      if ('error' in result) {
        sendError(ws, result.error, 'RECORD_ERROR');
        return;
      }
      autoSave(roomCode, result.game);
      roomManager.broadcast(roomCode, { type: 'penalty_recorded', penalty: result.penalty, game: result.game });
      break;
    }

    case 'undo_penalty': {
      const result = roomManager.undoGamePenalty(roomCode);
      if ('error' in result) {
        sendError(ws, result.error, 'UNDO_ERROR');
        return;
      }
      autoSave(roomCode, result);
      roomManager.broadcast(roomCode, { type: 'penalty_undone', game: result });
      break;
    }

    case 'end_game': {
      if (!requireHost(ws, ctx)) return;
      const result = roomManager.endGame(roomCode);
      if ('error' in result) {
        sendError(ws, result.error, 'END_ERROR');
        return;
      }
      const savedFilename = finalizeGame(roomCode, result.game, undefined, result.finalScores);
      const teamScores = getTeamScores(result.game, result.finalScores);
      roomManager.broadcast(roomCode, {
        type: 'game_ended',
        game: result.game,
        finalScores: result.finalScores,
        ...(savedFilename ? { savedFilename } : {}),
        ...(teamScores ? { teamScores } : {}),
      });
      break;
    }

    case 'force_quit_game': {
      if (!requireHost(ws, ctx)) return;
      const result = roomManager.endGame(roomCode);
      if ('error' in result) {
        sendError(ws, result.error, 'END_ERROR');
        return;
      }
      // Always save — game is finalized as interrupted
      const savedFilename = finalizeGame(roomCode, result.game, { interrupted: true }, result.finalScores);
      const teamScores = getTeamScores(result.game, result.finalScores);
      roomManager.broadcast(roomCode, {
        type: 'game_ended',
        game: result.game,
        finalScores: result.finalScores,
        ...(savedFilename ? { savedFilename } : {}),
        ...(teamScores ? { teamScores } : {}),
      });
      break;
    }

    case 'toggle_riichi': {
      const game = roomManager.getRoom(roomCode)?.currentGame;
      if (!game) { sendError(ws, '没有进行中的对局', 'RIICHI_ERROR'); return; }
      const pi = event.playerIndex;
      if (pi < 0 || pi > 3) { sendError(ws, '无效的玩家', 'RIICHI_ERROR'); return; }
      if (!game.liveRiichi) game.liveRiichi = [false, false, false, false];
      game.liveRiichi[pi] = !game.liveRiichi[pi];
      roomManager.broadcast(roomCode, { type: 'riichi_toggled', playerIndex: pi, riichi: game.liveRiichi[pi], liveRiichi: game.liveRiichi });
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
  roomManager.disconnectPlayer(ctx.roomCode, ctx.playerId, ws);
  connectionCtx.delete(ws);
}

function getTeamScores(game: Game, finalScores: FinalScore[]): TeamScore[] | null {
  if (!game.ruleset.teamMode || !game.players.some(p => p.team)) return null;
  const scores = calculateTeamScores(finalScores, game.players);
  return scores.length > 0 ? scores : null;
}

/** Auto-save in-progress game state to disk */
function autoSave(roomCode: string, game: Game): string | null {
  try {
    const existing = roomManager.getSavedFilename(roomCode);
    const filename = saveInProgressGame(game, existing ?? undefined);
    if (!existing) {
      roomManager.setSavedFilename(roomCode, filename);
    }
    return filename;
  } catch (err) {
    console.error('Failed to auto-save game:', err);
    return null;
  }
}

/** Finalize a game: write final scores, update player DB */
function finalizeGame(roomCode: string, game: Game, options?: { interrupted?: boolean }, precomputedScores?: FinalScore[]): string | null {
  try {
    const existing = roomManager.getSavedFilename(roomCode);
    if (!existing) {
      // No in-progress file yet — shouldn't happen, but handle gracefully
      console.warn('No in-progress file found for room', roomCode);
    }
    const finalScores = precomputedScores ?? roomManager.getGameFinalScores(roomCode) ?? [];
    const teamScores = getTeamScores(game, finalScores);
    // If we have an existing file, finalize it; otherwise create one
    const filename = existing
      ? finalizeGameRecord(game, finalScores, existing, options, teamScores ?? undefined)
      : finalizeGameRecord(game, finalScores, saveInProgressGame(game), options, teamScores ?? undefined);
    // Update player database
    const record = getGameRecord(filename);
    if (record) {
      updatePlayerDB(record, filename);
    }
    return filename;
  } catch (err) {
    console.error('Failed to finalize game record:', err);
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

function requireHost(ws: WSContext, ctx: ConnectionContext): boolean {
  if (ctx.isHost) return true;
  sendError(ws, '只有房主可以执行此操作 (Host capability required)', 'HOST_REQUIRED');
  return false;
}

function consumeMessageBudget(ctx: ConnectionContext): boolean {
  const now = Date.now();
  if (now - ctx.rateWindowStartedAt >= WS_RATE_WINDOW_MS) {
    ctx.rateWindowStartedAt = now;
    ctx.messagesInWindow = 0;
  }
  ctx.messagesInWindow += 1;
  return ctx.messagesInWindow <= MAX_WS_MESSAGES_PER_WINDOW;
}
