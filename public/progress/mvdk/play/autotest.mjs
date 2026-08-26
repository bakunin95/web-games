/**
 * Automated clear of T1–T3 via page.__mvdk test API.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/tmp/mvdk-pw/node_modules/playwright');

const BASE = process.env.MVDK_URL || 'http://localhost:5173/progress/mvdk/play/';

async function waitClear(page, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await page.evaluate(() => window.__mvdk.state.cleared)) return true;
    await page.waitForTimeout(60);
  }
  return false;
}

async function clearT1(page) {
  await page.evaluate(async () => {
    const m = window.__mvdk;
    m.loadRoom(0);
    await m.wait(120);
    m.hold('d');
    for (let i = 0; i < 80; i++) {
      await m.wait(35);
      if (m.state.onLadder || m.state.x > 300) break;
    }
    m.clearKeys();
    m.hold('w');
    for (let i = 0; i < 160; i++) {
      await m.wait(35);
      if (m.state.cleared) break;
    }
    m.clearKeys();
  });
  return waitClear(page);
}

async function clearT2(page) {
  await page.evaluate(async () => {
    const m = window.__mvdk;
    m.loadRoom(1);
    await m.wait(120);
    const hop = async (dir, walk) => {
      m.hold(dir);
      await m.wait(walk);
      m.hold(' ');
      await m.wait(150);
      m.clearKeys();
      await m.wait(260);
    };
    // onto first long platform
    await hop('d', 200);
    // across then up toward key
    m.hold('d');
    await m.wait(500);
    m.clearKeys();
    await hop('d', 100);
    await hop('a', 200);
    // get key
    for (let i = 0; i < 30 && !m.state.hasKey; i++) {
      m.hold(i % 2 ? 'a' : 'd');
      await m.wait(80);
      m.hold(' ');
      await m.wait(120);
      m.clearKeys();
      await m.wait(160);
    }
    // to door
    for (let i = 0; i < 14 && !m.state.cleared; i++) {
      await hop('d', 280);
    }
  });
  return waitClear(page, 10000);
}

async function clearT3(page) {
  await page.evaluate(async () => {
    const m = window.__mvdk;
    m.loadRoom(2);
    await m.wait(120);
    // climb ladder under switch platform
    m.hold('d');
    await m.wait(80);
    m.clearKeys();
    m.hold('w');
    for (let i = 0; i < 120; i++) {
      await m.wait(35);
      if (m.state.y < 200) break;
    }
    m.clearKeys();
    // walk to switch
    m.hold('d');
    await m.wait(700);
    m.clearKeys();
    await m.wait(300);
    // continue to door
    for (let i = 0; i < 20 && !m.state.cleared; i++) {
      if (!m.state.switchOn) {
        m.hold('a');
        await m.wait(150);
        m.hold('d');
        await m.wait(200);
        m.clearKeys();
      }
      m.hold('d');
      await m.wait(200);
      m.hold(' ');
      await m.wait(120);
      m.clearKeys();
      await m.wait(180);
    }
  });
  return waitClear(page, 10000);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const results = {};

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mvdk);
  await page.click('#c');

  results.T1 = (await clearT1(page)) ? 'PASS' : 'FAIL';
  console.log('T1', results.T1, await page.evaluate(() => window.__mvdk.state));
  results.T2 = (await clearT2(page)) ? 'PASS' : 'FAIL';
  console.log('T2', results.T2, await page.evaluate(() => window.__mvdk.state));
  results.T3 = (await clearT3(page)) ? 'PASS' : 'FAIL';
  console.log('T3', results.T3, await page.evaluate(() => window.__mvdk.state));
} finally {
  await browser.close();
}

const allPass = Object.values(results).every((v) => v === 'PASS');
console.log(JSON.stringify({ results, allPass }, null, 2));
process.exit(allPass ? 0 : 1);
