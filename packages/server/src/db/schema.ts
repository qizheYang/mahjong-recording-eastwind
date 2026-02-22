import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const rooms = sqliteTable('rooms', {
  code: text('code').primaryKey(),
  status: text('status').notNull(), // 'waiting' | 'playing' | 'finished'
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const players = sqliteTable('players', {
  id: text('id').primaryKey(),
  roomCode: text('room_code').references(() => rooms.code),
  name: text('name').notNull(),
  seatIndex: integer('seat_index'),
  joinedAt: integer('joined_at').notNull(),
});

export const games = sqliteTable('games', {
  id: text('id').primaryKey(),
  roomCode: text('room_code').references(() => rooms.code).notNull(),
  status: text('status').notNull(),
  rulesetJson: text('ruleset_json').notNull(),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
});

export const hands = sqliteTable('hands', {
  id: text('id').primaryKey(),
  gameId: text('game_id').references(() => games.id).notNull(),
  handNumber: integer('hand_number').notNull(),
  roundWind: text('round_wind').notNull(),
  roundNumber: integer('round_number').notNull(),
  dealerIndex: integer('dealer_index').notNull(),
  honba: integer('honba').notNull(),
  riichiSticksOnTable: integer('riichi_sticks').notNull(),
  resultType: text('result_type').notNull(),
  resultJson: text('result_json').notNull(),
  pointsBefore: text('points_before').notNull(),
  pointsAfter: text('points_after').notNull(),
  recordedAt: integer('recorded_at').notNull(),
});

export const finalScores = sqliteTable('final_scores', {
  id: text('id').primaryKey(),
  gameId: text('game_id').references(() => games.id).notNull(),
  playerIndex: integer('player_index').notNull(),
  playerName: text('player_name').notNull(),
  rawPoints: integer('raw_points').notNull(),
  placement: integer('placement').notNull(),
  uma: real('uma').notNull(),
  gameScore: real('game_score').notNull(),
});

export const adminAccounts = sqliteTable('admin_accounts', {
  username: text('username').primaryKey(),
  passwordHash: text('password_hash').notNull(),
  salt: text('salt').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const adminTokens = sqliteTable('admin_tokens', {
  token: text('token').primaryKey(),
  username: text('username').references(() => adminAccounts.username).notNull(),
  expiresAt: integer('expires_at').notNull(),
});

export const tags = sqliteTable('tags', {
  name: text('name').primaryKey(),
  createdAt: integer('created_at').notNull(),
});

export const registeredUsers = sqliteTable('registered_users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique().default(''),
  emailVerified: integer('email_verified').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
