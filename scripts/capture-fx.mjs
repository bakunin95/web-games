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

async function captureOne(fx) {
  const { default: WebSocket } = await import('ws').catch(() => ({ default: null }));
  // Prefer undici/native: use CDP HTTP /json/new then connect via websockets package if present.
  // Fallback: chrome --screenshot after page settles using a tiny evaluate via remote interface.

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

  // Dynamic import of ws — install if missing
  let WS;
  try {
    WS = (await import('ws')).default;
  } catch {
    console.log('Installing ws…');
    await new Promise((resolve, reject) => {
      const p = spawn('pnpm', ['add', '-D', 'ws'], { cwd: ROOT, stdio: 'inherit' });
      p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error('pnpm add ws failed'))));
    });
    WS = (await import('ws')).default;
  }

  const ws = new WS(wsUrl);
  await new Promise((res, rej) => {
    ws.once('open', res);
    ws.once('error', rej);
  });

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
