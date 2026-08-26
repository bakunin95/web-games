#!/usr/bin/env node
/**
 * Headless capture of isolated FX stills via Chrome DevTools Protocol.
 * Usage: node scripts/capture-fx.mjs [fire|smoke|water|all]
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import http from 'node:http';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT_PROGRESS = join(ROOT, 'progress', 'captures');
const OUT_PUBLIC = join(ROOT, 'public', 'progress', 'captures');
const PORT = 9222;
const BASE = 'http://127.0.0.1:5288';

const targets = process.argv[2] && process.argv[2] !== 'all'
  ? [process.argv[2]]
  : ['fire', 'smoke', 'water'];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
  return res.json();
}

async function waitForChrome(retries = 40) {
  for (let i = 0; i < retries; i++) {
    try {
      const list = await fetchJson(`http://127.0.0.1:${PORT}/json/version`);
      return list;
    } catch {
      await sleep(250);
    }
  }
  throw new Error('Chrome CDP not ready');
}

async function cdpSend(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const onMsg = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id === id) {
        ws.off('message', onMsg);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
    ws.on('message', onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

/**
 * Minimal `ws`-compatible shim over the runtime's native WebSocket so the
 * capture harness has no npm dependency (Node >= 21 ships global WebSocket).
 */
function openSocket(url) {
  const sock = new globalThis.WebSocket(url);
  const listeners = new Map();
  sock.addEventListener('message', (ev) => {
    for (const fn of listeners.get('message') ?? []) fn(ev.data);
  });
  return {
    raw: sock,
    on(evt, fn) {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt).add(fn);
    },
    off(evt, fn) {
      listeners.get(evt)?.delete(fn);
    },
    send(payload) {
      sock.send(payload);
    },
    close() {
      sock.close();
    },
    opened() {
      return new Promise((res, rej) => {
        if (sock.readyState === 1) return res();
        sock.addEventListener('open', () => res(), { once: true });
        sock.addEventListener('error', (e) => rej(e), { once: true });
      });
    },
  };
}

async function captureOne(fx) {
  // Smoke needs longer settle for wind-sheared plume to fill the frame
  const settle = fx === 'smoke' ? 7800 : 3200;
  const pageUrl = `${BASE}/capture.html?fx=${fx}&settle=${settle}`;

  // Create target
  const created = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(pageUrl)}`, {
    method: 'PUT',
  }).then((r) => r.json()).catch(async () => {
    // Older chrome: GET /json/new?url
    return fetchJson(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(pageUrl)}`);
  });

  const wsUrl = created.webSocketDebuggerUrl;
  if (!wsUrl) throw new Error('No webSocketDebuggerUrl: ' + JSON.stringify(created));

  const ws = openSocket(wsUrl);
  await ws.opened();

  let nextId = 1;
  const send = (method, params) => cdpSend(ws, nextId++, method, params);

  await send('Runtime.enable');
  await send('Page.enable');

  // Wait until window.__VFX_CAPTURE__.ready
  let dataUrl = '';
  const maxTries = fx === 'smoke' ? 90 : 60;
  for (let i = 0; i < maxTries; i++) {
    await sleep(200);
    const result = await send('Runtime.evaluate', {
      expression: `(() => {
        const c = window.__VFX_CAPTURE__;
        if (!c || !c.ready) return JSON.stringify({ ready: false });
        return JSON.stringify({ ready: true, dataUrl: c.dump() });
      })()`,
      returnByValue: true,
      awaitPromise: false,
    });
    const val = JSON.parse(result.result.value);
    if (val.ready) {
      dataUrl = val.dataUrl;
      break;
    }
  }

  if (!dataUrl) throw new Error(`Capture timeout for ${fx}`);

  const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  const buf = Buffer.from(b64, 'base64');
  mkdirSync(OUT_PROGRESS, { recursive: true });
  mkdirSync(OUT_PUBLIC, { recursive: true });
  const name = `${fx}.png`;
  writeFileSync(join(OUT_PROGRESS, name), buf);
  writeFileSync(join(OUT_PUBLIC, name), buf);
  console.log(`Wrote ${name} (${buf.length} bytes)`);

  try {
    await send('Page.close');
  } catch { /* ignore */ }
  ws.close();
}

async function main() {
  // Ensure vite is up
  try {
    const r = await fetch(BASE + '/');
    if (!r.ok) throw new Error('not ok');
  } catch {
    throw new Error('Dev server not running at ' + BASE);
  }

  const chrome = spawn(
    'google-chrome',
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      `--remote-debugging-port=${PORT}`,
      '--user-data-dir=/tmp/vfx-capture-chrome',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  let bootLog = '';
  chrome.stderr.on('data', (d) => { bootLog += d.toString(); });
  chrome.stdout.on('data', (d) => { bootLog += d.toString(); });

  try {
    await waitForChrome();
    for (const fx of targets) {
      await captureOne(fx);
    }
  } finally {
    chrome.kill('SIGTERM');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
