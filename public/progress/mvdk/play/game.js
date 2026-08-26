/**
 * MvsDK puzzle proto — T1 Teach ladder, T2 Teach key, T3 Switch gate
 * Tile legend: # solid  = girder  . air  H ladder  M spawn  D door  K key  S switch  ~ gated (air until switch)
 */

const TILE = 32;
const COLS = 24;
const ROWS = 14;

const ROOMS = [
  {
    id: 'T1',
    name: 'Teach ladder',
    aha: 'Climb the ladder to the door',
    targetSec: 20,
    map: [
      '########################',
      '#......................#',
      '#..........D...........#',
      '#..........H...........#',
      '#..........H...........#',
      '#..........H...........#',
      '#..........H...........#',
      '#..........H...........#',
      '#..........H...........#',
      '#..........H...........#',
      '#..........H...........#',
      '#..........H...........#',
      '#M.........H...........#',
      '########################',
    ],
  },
  {
    id: 'T2',
    name: 'Teach key',
    aha: 'Grab the key, jump the gaps, open the door',
    targetSec: 40,
    map: [
      '########################',
      '#......................#',
      '#K...................D.#',
      '#......................#',
      '#====............====..#',
      '#......................#',
      '#......====....====....#',
      '#......................#',
      '#......................#',
      '#....====........====..#',
      '#......................#',
      '#......................#',
      '#M.....................#',
      '########################',
    ],
  },
  {
    id: 'T3',
    name: 'Switch gate',
    aha: 'Hit the switch to extend the path',
    targetSec: 35,
    map: [
      '########################',
      '#......................#',
      '#....................D.#',
      '#......................#',
      '#......................#',
      '#====S~~~~========.....#',
      '#......................#',
      '#......................#',
      '#........====..........#',
      '#......................#',
      '#......................#',
      '#....====..............#',
      '#M.....................#',
      '########################',
    ],
  },
];

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');
const banner = document.getElementById('banner');
const bannerTitle = document.getElementById('banner-title');
const bannerSub = document.getElementById('banner-sub');
const roomBtns = document.getElementById('room-btns');

const keys = new Set();
let roomIndex = 0;
let grid = [];
let spawn = { x: 2, y: 12 };
let door = { x: 10, y: 2 };
let keyPos = null;
let switchPos = null;
let player;
let hasKey = false;
let switchOn = false;
let cleared = false;
let startedAt = performance.now();
let deaths = 0;
let message = '';
let messageUntil = 0;

function parseRoom(room) {
  grid = room.map.map((row) => row.split(''));
  spawn = { x: 2, y: 12 };
  door = { x: 10, y: 2 };
  keyPos = null;
  switchPos = null;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const t = grid[y][x];
      if (t === 'M') {
        spawn = { x, y };
        grid[y][x] = '.';
      } else if (t === 'D') {
        door = { x, y };
        grid[y][x] = '.';
      } else if (t === 'K') {
        keyPos = { x, y };
        grid[y][x] = '.';
      } else if (t === 'S') {
        switchPos = { x, y };
        // switch sits on girder; keep walkable tile under as =
        grid[y][x] = '=';
      }
    }
  }
}

function resetPlayer() {
  player = {
    x: spawn.x * TILE + 6,
    y: spawn.y * TILE + 4,
    vx: 0,
    vy: 0,
    w: 20,
    h: 28,
    onGround: false,
    onLadder: false,
    facing: 1,
  };
  hasKey = false;
  switchOn = false;
  cleared = false;
  startedAt = performance.now();
  banner.classList.remove('show');
  message = ROOMS[roomIndex].aha;
  messageUntil = performance.now() + 2800;
}

function loadRoom(i) {
  roomIndex = (i + ROOMS.length) % ROOMS.length;
  parseRoom(ROOMS[roomIndex]);
  resetPlayer();
  [...roomBtns.querySelectorAll('button')].forEach((b, idx) => {
    b.classList.toggle('active', idx === roomIndex);
  });
}

function tileAt(px, py) {
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return '#';
  let t = grid[ty][tx];
  if (t === '~') return switchOn ? '=' : '.';
  return t;
}

function solidAt(px, py) {
  const t = tileAt(px, py);
  return t === '#' || t === '=';
}

function ladderAt(px, py) {
  return tileAt(px, py) === 'H';
}

function rectTiles(x, y, w, h, fn) {
  const x0 = Math.floor(x / TILE);
  const y0 = Math.floor(y / TILE);
  const x1 = Math.floor((x + w - 0.001) / TILE);
  const y1 = Math.floor((y + h - 0.001) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (fn(tx, ty)) return true;
    }
  }
  return false;
}

function moveAxis(dx, dy) {
  player.x += dx;
  player.y += dy;

  // Resolve solid collisions (treat girder top as solid only from above for feet)
  const feetY = player.y + player.h;
  const headY = player.y;
  const left = player.x + 2;
  const right = player.x + player.w - 2;

  if (dx !== 0) {
    if (
      solidAt(left, headY + 4) ||
      solidAt(right, headY + 4) ||
      solidAt(left, feetY - 4) ||
      solidAt(right, feetY - 4)
    ) {
      // push out
      if (dx > 0) player.x = Math.floor(right / TILE) * TILE - player.w + 2;
      else player.x = Math.floor(left / TILE) * TILE + TILE - 2;
      player.vx = 0;
    }
  }

  if (dy !== 0) {
    const hittingFloor =
      dy > 0 &&
      (solidAt(left, feetY) || solidAt(right, feetY) || solidAt(player.x + player.w / 2, feetY));
    const hittingCeil =
      dy < 0 &&
      (solidAt(left, headY) || solidAt(right, headY));

    // Girder: only collide when falling onto top surface
    const onGirderTop = (px, py) => {
      const t = tileAt(px, py);
      if (t !== '=') return solidAt(px, py);
      const local = py % TILE;
      return local < 8;
    };

    if (dy > 0) {
      if (
        onGirderTop(left, feetY) ||
        onGirderTop(right, feetY) ||
        onGirderTop(player.x + player.w / 2, feetY)
      ) {
        player.y = Math.floor(feetY / TILE) * TILE - player.h;
        // if on girder, snap to top of tile
        const t = tileAt(player.x + player.w / 2, player.y + player.h + 1);
        if (t === '=' || t === '#') {
          player.y = Math.floor((player.y + player.h + 1) / TILE) * TILE - player.h;
        }
        player.vy = 0;
        player.onGround = true;
      }
    } else if (hittingCeil) {
      player.y = Math.floor(headY / TILE) * TILE + TILE;
      player.vy = 0;
    }
  }
}

function update(dt) {
  if (cleared) return;

  const left = keys.has('ArrowLeft') || keys.has('a') || keys.has('A');
  const right = keys.has('ArrowRight') || keys.has('d') || keys.has('D');
  const up = keys.has('ArrowUp') || keys.has('w') || keys.has('W');
  const down = keys.has('ArrowDown') || keys.has('s') || keys.has('S');
  const jump = keys.has(' ') || keys.has('Space') || up;

  const midX = player.x + player.w / 2;
  const midY = player.y + player.h * 0.5;
  player.onLadder =
    ladderAt(midX, midY) ||
    ladderAt(midX, player.y + 4) ||
    ladderAt(midX, player.y + player.h - 2);

  const speed = hasKey ? 150 : 190;
  player.vx = 0;
  if (left) {
    player.vx = -speed;
    player.facing = -1;
  }
  if (right) {
    player.vx = speed;
    player.facing = 1;
  }

  if (player.onLadder && (up || down || ladderAt(midX, midY))) {
    player.vy = 0;
    if (up) player.vy = -150;
    if (down) player.vy = 150;
    // slight horizontal snap toward ladder center while climbing
    const tx = Math.floor(midX / TILE);
    const target = tx * TILE + (TILE - player.w) / 2;
    player.x += (target - player.x) * Math.min(1, 8 * dt);
    if (keys.has(' ') && !up) {
      player.vy = -300;
      player.onLadder = false;
    }
  } else {
    player.vy += 1100 * dt;
    if (player.vy > 560) player.vy = 560;
    if (jump && player.onGround) {
      player.vy = -380;
      player.onGround = false;
    }
  }

  player.onGround = false;
  moveAxis(player.vx * dt, 0);
  moveAxis(0, player.vy * dt);

  // Ground check
  const foot = player.y + player.h + 1;
  if (
    solidAt(player.x + 4, foot) ||
    solidAt(player.x + player.w - 4, foot) ||
    tileAt(player.x + player.w / 2, foot) === '='
  ) {
    player.onGround = true;
  }

  // Pick up key
  if (keyPos && !hasKey) {
    const kx = keyPos.x * TILE + TILE / 2;
    const ky = keyPos.y * TILE + TILE / 2;
    if (Math.hypot(midX - kx, midY - ky) < 22) {
      hasKey = true;
      message = 'Got the key!';
      messageUntil = performance.now() + 1500;
    }
  }

  // Switch
  if (switchPos) {
    const sx = switchPos.x * TILE + TILE / 2;
    const sy = switchPos.y * TILE;
    if (Math.abs(midX - sx) < 18 && Math.abs(player.y + player.h - sy) < 14 && player.onGround) {
      if (!switchOn) {
        switchOn = true;
        message = 'Path extended!';
        messageUntil = performance.now() + 1600;
      }
    }
  }

  // Door clear
  const dx = door.x * TILE + TILE / 2;
  const dy = door.y * TILE + TILE / 2;
  const nearDoor = Math.hypot(midX - dx, midY - dy) < 26;
  const needsKey = !!keyPos;
  if (nearDoor && (!needsKey || hasKey)) {
    cleared = true;
    const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
    bannerTitle.textContent = `${ROOMS[roomIndex].id} Clear!`;
    bannerSub.textContent = `${elapsed}s (target ≤${ROOMS[roomIndex].targetSec}s) · Enter / N next · R retry`;
    banner.classList.add('show');
  }

  // Fell out
  if (player.y > ROWS * TILE + 40) {
    deaths += 1;
    resetPlayer();
    message = 'Fell — try again';
    messageUntil = performance.now() + 1200;
  }
}

function drawTile(t, x, y) {
  const px = x * TILE;
  const py = y * TILE;
  if (t === '#') {
    ctx.fillStyle = '#3a4558';
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = '#2a3344';
    ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
  } else if (t === '=') {
    ctx.fillStyle = '#c4a35a';
    ctx.fillRect(px, py + 10, TILE, 10);
    ctx.fillStyle = '#8a7038';
    ctx.fillRect(px, py + 18, TILE, 3);
  } else if (t === 'H') {
    ctx.strokeStyle = '#6ecf6e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px + 8, py);
    ctx.lineTo(px + 8, py + TILE);
    ctx.moveTo(px + 24, py);
    ctx.lineTo(px + 24, py + TILE);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 6; i < TILE; i += 8) {
      ctx.moveTo(px + 8, py + i);
      ctx.lineTo(px + 24, py + i);
    }
    ctx.stroke();
  } else if (t === '~') {
    if (switchOn) {
      drawTile('=', x, y);
    } else {
      ctx.fillStyle = 'rgba(255, 80, 80, 0.12)';
      ctx.fillRect(px, py + 12, TILE, 6);
    }
  }
}

function draw() {
  // sky / factory bg
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, '#1a2233');
  g.addColorStop(1, '#0c1018');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // soft grid
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * TILE, 0);
    ctx.lineTo(x * TILE, ROWS * TILE);
    ctx.stroke();
  }

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      drawTile(grid[y][x], x, y);
    }
  }

  // door
  ctx.fillStyle = hasKey || !keyPos ? '#5dff9a' : '#6a7388';
  ctx.fillRect(door.x * TILE + 6, door.y * TILE + 2, TILE - 12, TILE - 4);
  ctx.fillStyle = '#1a1f2a';
  ctx.fillRect(door.x * TILE + 10, door.y * TILE + 8, 6, 10);

  // key
  if (keyPos && !hasKey) {
    const kx = keyPos.x * TILE + 16;
    const ky = keyPos.y * TILE + 16;
    ctx.fillStyle = '#ffc107';
    ctx.beginPath();
    ctx.arc(kx - 4, ky - 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(kx - 2, ky + 2, 12, 3);
  }

  // switch
  if (switchPos) {
    const sx = switchPos.x * TILE + 16;
    const sy = switchPos.y * TILE + 6;
    ctx.fillStyle = switchOn ? '#5dff9a' : '#e52521';
    ctx.fillRect(sx - 4, sy - 8, 8, 14);
    ctx.fillStyle = '#ddd';
    ctx.fillRect(sx - 10, sy - 2, 20, 4);
  }

  // player (Mario-ish)
  const px = player.x;
  const py = player.y;
  ctx.fillStyle = '#e52521';
  ctx.fillRect(px + 2, py + 8, player.w - 4, player.h - 10);
  ctx.fillStyle = '#ffcc99';
  ctx.fillRect(px + 4, py, player.w - 8, 12);
  ctx.fillStyle = '#222';
  ctx.fillRect(px + (player.facing > 0 ? 12 : 4), py + 4, 4, 3);
  if (hasKey) {
    ctx.fillStyle = '#ffc107';
    ctx.fillRect(px + player.w - 2, py + 14, 10, 3);
  }

  // HUD
  const room = ROOMS[roomIndex];
  const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
  const tip = performance.now() < messageUntil ? `\n${message}` : '';
  hud.textContent = `${room.id} · ${room.name}\nTime ${elapsed}s / ≤${room.targetSec}s · Deaths ${deaths}${hasKey ? ' · KEY' : ''}${switchOn ? ' · SWITCH ON' : ''}${tip}`;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

window.addEventListener('keydown', (e) => {
  keys.add(e.key);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  if (e.key === 'r' || e.key === 'R') resetPlayer();
  if (e.key === 'n' || e.key === 'N' || e.key === 'Enter') {
    if (cleared || e.key === 'n' || e.key === 'N') loadRoom(roomIndex + 1);
  }
  if (e.key >= '1' && e.key <= '3') loadRoom(Number(e.key) - 1);
});
window.addEventListener('keyup', (e) => keys.delete(e.key));

ROOMS.forEach((room, i) => {
  const b = document.createElement('button');
  b.className = 'room';
  b.type = 'button';
  b.textContent = `${room.id} ${room.name}`;
  b.addEventListener('click', () => loadRoom(i));
  roomBtns.appendChild(b);
});

loadRoom(0);
requestAnimationFrame(frame);
