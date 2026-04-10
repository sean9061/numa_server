import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { authRouter, verifyToken, COOKIE_NAME_EXPORT as COOKIE_NAME } from './auth.js';
import { collectMetrics } from './metrics.js';
import { listContainers, getContainerStats, streamContainerLogs, startNpmTracking, getWebStats } from './docker-monitor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? 3000;

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());

// Rate limit login attempts
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});

app.use('/auth', loginLimit, authRouter);

// Serve login page and static assets without auth
app.use(express.static(join(__dirname, '../public')));

// Redirect / to login if not authenticated
app.get('/', (req, res, next) => {
  if (!verifyToken(req.cookies?.[COOKIE_NAME])) {
    return res.redirect('/login.html');
  }
  next();
});

// Protected REST endpoints
const apiAuth = (req, res, next) => {
  if (!verifyToken(req.cookies?.[COOKIE_NAME])) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

app.get('/api/metrics', apiAuth, async (_req, res) => {
  try {
    res.json(await collectMetrics());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/containers', apiAuth, async (_req, res) => {
  try {
    res.json(await listContainers());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// WebSocket server — requires auth cookie
function parseCookies(cookieHeader = '') {
  return Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k.trim(), decodeURIComponent(v.join('='))];
    })
  );
}

// Per-client log subscriptions
const clientLogStops = new WeakMap();

wss.on('connection', (ws, req) => {
  const cookies = parseCookies(req.headers.cookie);
  if (!verifyToken(cookies[COOKIE_NAME])) {
    ws.close(1008, 'Unauthorized');
    return;
  }

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'subscribe_logs') {
        const container = String(msg.container ?? '');
        if (!container) return;

        // Stop previous log stream for this client if any
        const stops = clientLogStops.get(ws) ?? {};
        stops[container]?.();

        const stop = streamContainerLogs(container, (line) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'log', container, line }));
          }
        });

        stops[container] = stop;
        clientLogStops.set(ws, stops);
      }

      if (msg.type === 'unsubscribe_logs') {
        const container = String(msg.container ?? '');
        const stops = clientLogStops.get(ws) ?? {};
        stops[container]?.();
        delete stops[container];
      }
    } catch {
      // ignore malformed messages
    }
  });

  ws.on('close', () => {
    const stops = clientLogStops.get(ws) ?? {};
    for (const stop of Object.values(stops)) stop?.();
  });

  send(ws, { type: 'connected' });
});

function send(ws, data) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
}

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(msg);
  }
}

// Web request tracking (server-side, always running)
startNpmTracking();

// Metrics broadcast loop (every 2s)
setInterval(async () => {
  if (wss.clients.size === 0) return;
  try {
    broadcast({ type: 'metrics', data: await collectMetrics() });
    broadcast({ type: 'web_requests', data: getWebStats() });
  } catch (err) {
    console.error('[metrics]', err.message);
  }
}, 2000);

// Docker container list (every 5s)
setInterval(async () => {
  if (wss.clients.size === 0) return;
  try {
    broadcast({ type: 'docker', data: await listContainers() });
  } catch (err) {
    console.error('[docker]', err.message);
  }
}, 5000);

// Container stats per running container (every 5s)
setInterval(async () => {
  if (wss.clients.size === 0) return;
  try {
    const containers = await listContainers();
    const running = containers.filter(c => c.state === 'running');
    const statsArr = await Promise.all(
      running.map(async c => ({ name: c.name, stats: await getContainerStats(c.name) }))
    );
    broadcast({ type: 'container_stats', data: statsArr.filter(s => s.stats !== null) });
  } catch (err) {
    console.error('[container_stats]', err.message);
  }
}, 5000);

// WebSocket heartbeat
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`[server] Dashboard running on port ${PORT}`);
});
