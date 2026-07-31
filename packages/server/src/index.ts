import 'dotenv/config';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { getDb } from './db/connection.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const BASE_PATH = process.env.BASE_PATH || '/mahjong-recording';
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0');

// Initialize database
getDb();

const { app, injectWebSocket } = createApp();

const server = serve({
  fetch: app.fetch,
  port: PORT,
  hostname: HOST,
}, (info) => {
  console.log(`Mahjong Recording Server running at http://${HOST}:${info.port}${BASE_PATH}`);
  console.log(`  API: http://localhost:${info.port}${BASE_PATH}/api/health`);
  console.log(`  WS:  ws://localhost:${info.port}${BASE_PATH}/ws`);
});

injectWebSocket(server);
