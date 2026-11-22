import express from 'express';
import http from 'http';
import cors from 'cors';
import { config } from './config.js';
import { initDb } from './db/index.js';
import { authRouter } from './routes/auth.routes.js';
import { channelRouter } from './routes/channel.routes.js';
import { WalkieWsServer } from './realtime/wsServer.js';

const app = express();
const server = http.createServer(app);

// Global Middleware
app.use(cors({
  origin: config.clientOrigin === '*' ? true : [config.clientOrigin],
  credentials: true,
}));
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Walkie Talkie API',
    timestamp: new Date().toISOString(),
    env: config.nodeEnv,
  });
});

// Mount API routes
app.use('/api/auth', authRouter);
app.use('/api/channels', channelRouter);

// Initialize DB and Realtime WS Server
export async function startServer() {
  await initDb();

  const wsServer = new WalkieWsServer(server);

  server.listen(config.port, '0.0.0.0', () => {
    console.log(`[Server] Walkie Talkie API listening on port ${config.port} (${config.nodeEnv})`);
  });

  return { app, server, wsServer };
}

// Graceful shutdown
const shutdown = () => {
  console.log('[Server] Shutting down...');
  server.close(() => {
    console.log('[Server] HTTP and WebSocket servers closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Auto-start when executed directly
if (process.argv[1] && (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js'))) {
  startServer().catch((err) => {
    console.error('[Server] Fatal startup error:', err);
    process.exit(1);
  });
}
