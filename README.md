# 🀄 麻雀記録 — Riichi Mahjong Recorder

A real-time web app for recording Riichi Mahjong games with M-League rules. Built for mobile-first use at the table.

## Features

- **Room-based multiplayer** — Create/join rooms with 4-character codes, real-time sync via WebSocket
- **Solo mode** — One person records for the entire table
- **Hand recording** — Step-by-step wizard for agari (ron/tsumo) and ryuukyoku (draw) with han/fu input
- **Riichi tracking** — Records riichi declarations per hand with 1000-point deposits
- **Automatic scoring** — M-League rules with configurable starting points, return points, uma, tobi, and more
- **Game history** — Browse past games with filters by player, date, and custom tags
- **Player stats** — Per-player records with placement averages, game score trends, and tag-filtered stats
- **Custom tags** — Create and manage tags (e.g. 公式战, 練習) to categorize games
- **Admin system** — Admin accounts can annotate games (official game flag, notes), manage tags, and retag games
- **Live games** — Homepage shows active rooms with current round and point standings (polls every 10s)
- **Undo support** — Undo the last recorded hand with full state reversal including riichi deposits

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Client | React 19, Vite 6, Tailwind CSS v4, Zustand |
| Server | Hono, @hono/node-ws, Node.js |
| Database | SQLite (better-sqlite3 + drizzle ORM) for admin/tags, JSON files for game records |
| Shared | TypeScript monorepo with shared game logic and types |

## Project Structure

```
packages/
  shared/     Game logic, types, scoring engine, constants
  server/     Hono API + WebSocket server, SQLite DB, game file persistence
  client/     React SPA with mobile-first UI
tests/        Vitest tests (scoring, state machine, server integration)
```

## Development

```bash
npm install
npm run dev        # Start server + client in parallel
npm run build      # Build all packages
npm test           # Run all tests
```

The dev server runs at `http://localhost:5173` (client) and `http://localhost:3456` (API).

## Rules

Default ruleset follows M-League rules:

- Starting points: 25,000
- Return points: 30,000
- Uma: +30 / +10 / -10 / -30
- Oka enabled (first place bonus from return point difference)
- Kiriage mangan for 4han 30fu and 3han 60fu

All rules are configurable per game in the lobby.

## Deployment

Deployed via GitHub Actions to a production server. The server serves the client SPA in production mode under a configurable `BASE_PATH` (default: `/mahjong-recording`).

Environment variables:
- `PORT` — Server port (default: 3456)
- `BASE_PATH` — URL prefix (default: `/mahjong-recording`)
- `GAMES_DIR` — Directory for game JSON files (default: `./data/games`)
- `DATABASE_PATH` — SQLite database path (default: `./data/mahjong.db`)
- `NODE_ENV` — Set to `production` to enable static file serving
