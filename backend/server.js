import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import http from 'http';

import { config, isDevelopment } from './config/index.js';
import { initializeDatabase, getDatabase } from './db/connection.js';
import { logger } from './utils/logger.js';
import { apiRateLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { cleanupSessions } from './middleware/auth.js';

import authRoutes from './routes/auth.js';

// Helper function to parse cookies from WebSocket headers
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...value] = cookie.split('=');
    if (name && value.length) {
      cookies[name.trim()] = decodeURIComponent(value.join('=').trim());
    }
  });
  return cookies;
}

// Helper function to validate WebSocket authentication
function validateWebSocketAuth(req) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies['vault_session'] || req.headers.authorization?.replace('Bearer ', '');
  
  if (!sessionId) {
    return { valid: false, sessionId: null };
  }

  const db = getDatabase();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > datetime("now")')
    .get(sessionId);

  return { valid: !!session, sessionId };
}
import luksRoutes from './routes/luks.js';
import envRoutes from './routes/env.js';
import skillsRoutes from './routes/skills.js';
import servicesRoutes from './routes/services.js';
import filesRoutes from './routes/files.js';
import exportRoutes from './routes/export.js';

import { usbMonitor } from './services/usbMonitor.js';
import { getStatus } from './services/luksManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Initialize database
initializeDatabase();

// WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Set();

wss.on('connection', (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  
  // Validate authentication before allowing connection
  const authResult = validateWebSocketAuth(req);
  
  if (!authResult.valid) {
    logger.warn({ ip: clientIP }, 'WebSocket connection rejected: authentication required');
    ws.close(4001, 'Authentication required');
    return;
  }

  logger.info({ ip: clientIP }, 'WebSocket client connected');
  clients.add(ws);

  // Send current vault status immediately
  getStatus().then(status => {
    ws.send(JSON.stringify({ type: 'vault-state', payload: status }));
  }).catch(err => logger.error({ error: err }, 'Failed to send initial vault status'));

  ws.on('close', () => {
    clients.delete(ws);
    logger.info('WebSocket client disconnected');
  });

  ws.on('error', (err) => {
    logger.error({ error: err }, 'WebSocket error');
    clients.delete(ws);
  });
});

// Broadcast to all connected clients
function broadcast(message) {
  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === 1) { // OPEN
      client.send(data);
    }
  }
}

// USB monitoring events
usbMonitor.on('attached', (data) => {
  logger.info(data, 'USB device attached');
  broadcast({ type: 'usb-status', payload: { present: true, ...data } });
});

usbMonitor.on('detached', (data) => {
  logger.info(data, 'USB device detached');
  broadcast({ type: 'usb-status', payload: { present: false, ...data } });
});

// Periodic vault status broadcast
setInterval(() => {
  getStatus().then(status => {
    broadcast({ type: 'vault-state', payload: status });
  }).catch(err => logger.error({ error: err }, 'Periodic vault status failed'));
}, 5000);

// Start USB monitoring
usbMonitor.start();

// Session cleanup every 5 minutes
setInterval(cleanupSessions, 5 * 60 * 1000);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: isDevelopment() ? false : {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: config.security.corsOrigin,
  credentials: true,
}));

app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use('/api/', apiRateLimiter);

// Request logging
app.use((req, _res, next) => {
  logger.debug({ method: req.method, path: req.path, ip: req.ip }, 'Incoming request');
  next();
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/luks', luksRoutes);
app.use('/api/env', envRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/export', exportRoutes);

// Activity log endpoint
app.get('/api/activity', (req, res, next) => {
  try {
    const db = getDatabase();
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const rows = db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?').all(limit);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

// Serve frontend static files in production
if (!isDevelopment()) {
  const frontendDist = path.join(__dirname, '../frontend/dist');
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = config.server.port;
const HOST = config.server.host;

server.listen(PORT, HOST, () => {
  logger.info({ host: HOST, port: PORT }, 'OpenClaw Secure Vault server started');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  usbMonitor.stop();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  usbMonitor.stop();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
