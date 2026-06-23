// SwitchBot Cloud API (v1.1) client + polling loop for the HOME panel.
// Polls device statuses on an interval, normalizes them into a flat shape the
// frontend can render, and caches the latest snapshot. Disabled (no-op) when
// SWITCHBOT_TOKEN / SWITCHBOT_SECRET are not configured.
import crypto from 'crypto';

const BASE   = 'https://api.switch-bot.com/v1.1';
const TOKEN  = process.env.SWITCHBOT_TOKEN  ?? '';
const SECRET = process.env.SWITCHBOT_SECRET ?? '';
// Cloud API budget is 10,000 req/day. With N devices polled every P seconds
// the daily cost is N * 86400 / P. Default 90s keeps ~7 devices well under.
const POLL_MS    = Math.max(30, parseInt(process.env.HOME_POLL_SECONDS) || 90) * 1000;
const DISCOVER_MS = 60 * 60 * 1000; // refresh device list hourly

export const homeEnabled = Boolean(TOKEN && SECRET);

let devices = [];      // raw deviceList from /devices
let state   = [];      // normalized snapshot (latest)
let lastError = null;

function authHeaders() {
  const t = Date.now().toString();
  const nonce = crypto.randomUUID();
  const sign = crypto.createHmac('sha256', SECRET).update(TOKEN + t + nonce).digest('base64');
  return { Authorization: TOKEN, sign, nonce, t, 'Content-Type': 'application/json' };
}

async function api(path) {
  const res = await fetch(BASE + path, { headers: authHeaders() });
  const json = await res.json();
  if (json.statusCode !== 100) {
    throw new Error(`SwitchBot ${path} → ${json.statusCode} ${json.message ?? ''}`);
  }
  return json.body;
}

// deviceType → coarse kind the frontend uses to pick a tile renderer
function classify(type = '') {
  if (type === 'Hub 2' || /Meter/i.test(type) || type === 'WoIOSensor') return 'climate';
  if (/Plug/i.test(type))                                                return 'plug';
  if (type === 'Color Bulb' || /Light|Bulb|Lamp/i.test(type))            return 'light';
  if (/Lock/i.test(type))                                                return 'lock';
  if (type === 'Bot')                                                    return 'bot';
  if (/Keypad/i.test(type))                                              return 'keypad';
  return 'generic';
}

const num   = v => (typeof v === 'number' && !Number.isNaN(v) ? v : null);
const onOff = v => (v === 'on' ? true : v === 'off' ? false : null);

// Flatten a device + its status into the shape consumed by the store/tiles.
function normalize(device, status, ok) {
  const s = status ?? {};
  return {
    deviceId: device.deviceId,
    name:     device.deviceName,
    type:     device.deviceType,
    kind:     classify(device.deviceType),
    online:   s.onlineStatus ? s.onlineStatus === 'online' : ok,
    battery:  num(s.battery),
    // climate (Hub 2 / Meter)
    temperature: num(s.temperature),
    humidity:    num(s.humidity),
    lightLevel:  num(s.lightLevel),
    // plug
    power:    num(s.weight),          // instantaneous power draw (W)
    voltage:  num(s.voltage),         // V
    current:  num(s.electricCurrent), // mA
    energyDay: num(s.electricityOfDay), // minutes of use today
    // on/off (plug, light, bot)
    on:        onOff(s.power),
    brightness: num(s.brightness),
    color:      typeof s.color === 'string' ? s.color : null,
    colorTemp:  num(s.colorTemperature),
    // lock
    lockState: s.lockState ?? null,
    doorState: s.doorState ?? null,
    // bot
    mode: s.deviceMode ?? null,
  };
}

async function discover() {
  const body = await api('/devices');
  devices = (body?.deviceList ?? []).filter(d => d.enableCloudService !== false);
}

async function poll() {
  const next = [];
  for (const d of devices) {
    try {
      const status = await api(`/devices/${d.deviceId}/status`);
      next.push(normalize(d, status, true));
    } catch {
      // Status unavailable (e.g. offline device) — keep it visible as offline.
      next.push(normalize(d, null, false));
    }
  }
  state = next;
}

export function getHomeState() {
  return { devices: state, error: lastError, enabled: homeEnabled };
}

// Start the polling loop. `onUpdate(state)` fires after each successful poll.
export function startHomePolling(onUpdate) {
  if (!homeEnabled) {
    console.log('[home] SwitchBot disabled (SWITCHBOT_TOKEN/SECRET not set)');
    return;
  }

  const tick = async () => {
    try {
      await poll();
      lastError = null;
      onUpdate?.(state);
    } catch (err) {
      lastError = err.message;
      console.error('[home]', err.message);
    }
  };

  const rediscover = async () => {
    try {
      await discover();
    } catch (err) {
      lastError = err.message;
      console.error('[home] discover', err.message);
    }
  };

  // Initial discovery, then first poll, then intervals.
  rediscover().then(tick);
  setInterval(tick, POLL_MS);
  setInterval(rediscover, DISCOVER_MS);
  const devCount = () => devices.length;
  console.log(`[home] SwitchBot polling every ${POLL_MS / 1000}s (~${devCount()} devices)`);
}
