import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

if (!process.env.DASHBOARD_PASSWORD) {
  console.error('[auth] DASHBOARD_PASSWORD must be set');
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error('[auth] JWT_SECRET must be set');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = '24h';
const COOKIE_NAME = 'numa_token';

// Hash password once at startup
const passwordHash = await bcrypt.hash(process.env.DASHBOARD_PASSWORD, 10);

// Optional IP allowlist (CIDR prefix matching — simple implementation)
const ALLOWED_IPS = process.env.ALLOWED_IPS
  ? process.env.ALLOWED_IPS.split(',').map(s => s.trim()).filter(Boolean)
  : [];

function isIpAllowed(ip) {
  if (ALLOWED_IPS.length === 0) return true;
  const clean = ip.replace(/^::ffff:/, ''); // strip IPv4-mapped IPv6
  return ALLOWED_IPS.some(allowed => clean.startsWith(allowed.replace(/\/\d+$/, '')));
}

export function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export const COOKIE_NAME_EXPORT = COOKIE_NAME;

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { password } = req.body ?? {};

  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  if (!isIpAllowed(req.ip)) {
    return res.status(403).json({ error: 'Access denied from this IP' });
  }

  const valid = await bcrypt.compare(String(password), passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = jwt.sign({ auth: true }, JWT_SECRET, { expiresIn: JWT_EXPIRY });

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
  });

  res.json({ ok: true });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

authRouter.get('/check', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  res.json({ authenticated: !!verifyToken(token) });
});
