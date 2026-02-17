import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createNodeWebSocket } from '@hono/node-ws';
import { roomRoutes } from './routes/rooms.js';
import { handleWSOpen, handleWSMessage, handleWSClose } from './ws/handler.js';
import { gameFileRoutes } from './routes/game-files.js';
import { playerRoutes } from './routes/players.js';
import { fileURLToPath } from 'url';
import { dirname, resolve, join, extname } from 'path';
import { readFile, stat } from 'fs/promises';

const BASE_PATH = process.env.BASE_PATH || '/mahjong-recording';
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = process.env.CLIENT_DIST || resolve(__dirname, '../../client/dist');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export function createApp() {
  const app = new Hono();
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

  // CORS for development
  app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }));

  // Health check (no base path prefix)
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Create a sub-app with the base path
  const api = new Hono();

  // API routes
  api.route('/api/rooms', roomRoutes);
  api.route('/api/games', gameFileRoutes);
  api.route('/api/players', playerRoutes);

  // API health
  api.get('/api/health', (c) => c.json({ status: 'ok', basePath: BASE_PATH }));

  // WebSocket endpoint
  api.get(
    '/ws',
    upgradeWebSocket((c) => {
      const roomCode = c.req.query('roomCode') || '';
      const playerId = c.req.query('playerId') || '';

      return {
        onOpen(_evt, ws) {
          handleWSOpen(ws, roomCode, playerId);
        },
        onMessage(evt, ws) {
          handleWSMessage(ws, evt.data);
        },
        onClose(_evt, ws) {
          handleWSClose(ws);
        },
      };
    })
  );

  // Mount the sub-app at the base path
  app.route(BASE_PATH, api);

  // Serve static files for the client SPA (production)
  if (process.env.NODE_ENV === 'production') {
    app.get(`${BASE_PATH}/*`, async (c) => {
      // Strip the base path to get the relative file path
      const urlPath = c.req.path.replace(BASE_PATH, '') || '/';
      const filePath = join(CLIENT_DIST, urlPath === '/' ? 'index.html' : urlPath);

      try {
        // Security: prevent directory traversal
        const resolved = resolve(filePath);
        if (!resolved.startsWith(CLIENT_DIST)) {
          return c.text('Forbidden', 403);
        }

        const fileStat = await stat(resolved);
        if (!fileStat.isFile()) {
          throw new Error('Not a file');
        }

        const content = await readFile(resolved);
        const ext = extname(resolved);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        return c.body(content, 200, { 'Content-Type': contentType, 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' });
      } catch {
        // SPA fallback: serve index.html for any non-file route
        try {
          const indexContent = await readFile(join(CLIENT_DIST, 'index.html'));
          return c.body(indexContent, 200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        } catch {
          return c.text('Not Found', 404);
        }
      }
    });
  }

  return { app, injectWebSocket };
}
