import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { createNodeWebSocket } from '@hono/node-ws';
import { roomRoutes } from './routes/rooms.js';
import { handleWSOpen, handleWSMessage, handleWSClose } from './ws/handler.js';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const BASE_PATH = process.env.BASE_PATH || '/mahjong-recording';
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = process.env.CLIENT_DIST || resolve(__dirname, '../../client/dist');

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
    app.use(`${BASE_PATH}/*`, serveStatic({
      root: CLIENT_DIST,
      rewriteRequestPath: (path: string) => path.replace(BASE_PATH, ''),
    }));

    // SPA fallback
    app.get(`${BASE_PATH}/*`, serveStatic({
      root: CLIENT_DIST,
      rewriteRequestPath: () => '/index.html',
    }));
  }

  return { app, injectWebSocket };
}
