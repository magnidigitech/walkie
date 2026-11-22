import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'walkie-talkie-super-secret-jwt-key-change-in-prod-32chars',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://walkie:walkietalkie_secret@localhost:5432/walkietalkie',
  livekit: {
    url: process.env.LIVEKIT_URL || 'http://localhost:7880',
    apiKey: process.env.LIVEKIT_API_KEY || 'devkey',
    apiSecret: process.env.LIVEKIT_API_SECRET || 'secretwalkiekeymustbe32charactersormorelong!',
  },
  clientOrigin: process.env.CLIENT_ORIGIN || '*',
  turnMaxDurationMs: parseInt(process.env.TURN_MAX_DURATION_MS || '30000', 10), // 30s max per turn
  turnHeartbeatTimeoutMs: parseInt(process.env.TURN_HEARTBEAT_TIMEOUT_MS || '3500', 10), // 3.5s watchdog
};
