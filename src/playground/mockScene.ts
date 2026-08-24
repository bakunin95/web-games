import type { SceneContext } from '../core/types';

interface Building {
  x: number;
  y: number;
  w: number;
  h: number;
  tone: number;
  windows: boolean;
}

const BUILDINGS: Building[] = [
  { x: 180, y: 380, w: 140, h: 420, tone: 0.18, windows: true },
  { x: 340, y: 460, w: 110, h: 340, tone: 0.22, windows: true },
  { x: 480, y: 300, w: 160, h: 500, tone: 0.14, windows: true },
  { x: 980, y: 340, w: 180, h: 460, tone: 0.2, windows: true },
  { x: 1200, y: 420, w: 130, h: 380, tone: 0.16, windows: true },
  { x: 1600, y: 280, w: 200, h: 520, tone: 0.12, windows: true },
  { x: 1860, y: 400, w: 150, h: 400, tone: 0.19, windows: true },
  { x: 720, y: 500, w: 90, h: 300, tone: 0.25, windows: false },
];

function fillSky(ctx: CanvasRenderingContext2D, scene: SceneContext): void {
  const g = ctx.createLinearGradient(0, 0, 0, scene.worldHeight);
  g.addColorStop(0, '#070b18');
  g.addColorStop(0.45, '#0d1528');
  g.addColorStop(1, '#12101a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, scene.worldWidth, scene.worldHeight);
}

function drawDistantCity(ctx: CanvasRenderingContext2D, t: number, scene: SceneContext): void {
  const baseY = 520;
  ctx.save();
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 40; i++) {
    const x = (i * 67 + Math.sin(t * 0.05 + i) * 8) % scene.worldWidth;
    const h = 40 + ((i * 37) % 90);
    ctx.fillStyle = i % 3 === 0 ? '#1a2440' : '#141c30';
    ctx.fillRect(x, baseY - h, 28 + (i % 5) * 4, h);
  }
  ctx.restore();
}

function drawBuildings(ctx: CanvasRenderingContext2D, t: number): void {
  for (const b of BUILDINGS) {
    const shade = Math.floor(b.tone * 255);
    ctx.fillStyle = `rgb(${shade + 8}, ${shade + 12}, ${shade + 28})`;
    ctx.fillRect(b.x, b.y, b.w, b.h);

    // Roof lip
    ctx.fillStyle = `rgba(255,255,255,0.04)`;
    ctx.fillRect(b.x - 4, b.y - 6, b.w + 8, 8);

    if (b.windows) {
      const cols = Math.max(2, Math.floor(b.w / 22));
      const rows = Math.max(3, Math.floor(b.h / 28));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const flicker = (Math.sin(t * 1.7 + r * 0.7 + c * 1.3 + b.x * 0.01) + 1) * 0.5;
          const on = flicker > 0.35;
          if (!on) continue;
          const wx = b.x + 10 + c * ((b.w - 20) / cols);
          const wy = b.y + 14 + r * ((b.h - 28) / rows);
          const warm = (c + r) % 4 === 0;
          ctx.fillStyle = warm
            ? `rgba(255, 210, 140, ${0.25 + flicker * 0.45})`
            : `rgba(140, 210, 255, ${0.2 + flicker * 0.4})`;
          ctx.fillRect(wx, wy, 8, 12);
        }
      }
    }
  }
}

function drawStreet(ctx: CanvasRenderingContext2D, scene: SceneContext): void {
  const y = 800;
  ctx.fillStyle = '#14141c';
  ctx.fillRect(0, y, scene.worldWidth, scene.worldHeight - y);

  // Wet sheen base
  if (scene.rainWet) {
    const g = ctx.createLinearGradient(0, y, 0, y + 200);
    g.addColorStop(0, 'rgba(80, 120, 180, 0.12)');
    g.addColorStop(1, 'rgba(20, 30, 50, 0.02)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, scene.worldWidth, 220);
  }

  // Lane markings
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.setLineDash([28, 22]);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, y + 90);
  ctx.lineTo(scene.worldWidth, y + 90);
  ctx.stroke();
  ctx.setLineDash([]);

  // Curb
  ctx.fillStyle = '#2a2a36';
  ctx.fillRect(0, y - 10, scene.worldWidth, 12);
}

function drawNeonSigns(ctx: CanvasRenderingContext2D, t: number, scene: SceneContext): void {
  for (const light of scene.lights) {
    if (!light.id.startsWith('neon')) continue;
    const pulse = 0.75 + Math.sin(t * 2.2 + light.x * 0.01) * 0.25;
    ctx.save();
    ctx.shadowColor = light.color;
    ctx.shadowBlur = 24 * light.intensity * pulse;
    ctx.fillStyle = light.color;
    ctx.globalAlpha = 0.85 * pulse;
    ctx.fillRect(light.x - 36, light.y - 18, 72, 18);
    ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#0a0a12';
    ctx.globalAlpha = 0.9;
    ctx.shadowBlur = 0;
    ctx.fillText(light.id === 'neon-pink' ? 'NOVA' : 'FLUX', light.x - 20, light.y - 4);
    ctx.restore();
  }
}

function drawHazardMarkers(ctx: CanvasRenderingContext2D, scene: SceneContext): void {
  for (const z of scene.hazardZones) {
    ctx.save();
    ctx.strokeStyle = z.color;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(z.x, z.y, z.width, z.height);
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = z.color;
    ctx.fillRect(z.x, z.y, z.width, z.height);
    ctx.restore();
  }
}

function drawLightPools(ctx: CanvasRenderingContext2D, scene: SceneContext, t: number): void {
  for (const light of scene.lights) {
    const pulse = 0.85 + Math.sin(t * 1.4 + light.x * 0.02) * 0.15;
    const g = ctx.createRadialGradient(
      light.x,
      light.y,
      8,
      light.x,
      light.y,
      light.radius * pulse,
    );
    g.addColorStop(0, withAlpha(light.color, 0.35 * light.intensity));
    g.addColorStop(0.45, withAlpha(light.color, 0.12 * light.intensity));
    g.addColorStop(1, withAlpha(light.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(light.x, light.y, light.radius * pulse, 0, Math.PI * 2);
    ctx.fill();

    // Wet road reflection smear
    if (scene.rainWet) {
      const rg = ctx.createRadialGradient(
        light.x,
        light.y + 110,
        4,
        light.x,
        light.y + 110,
        light.radius * 0.7,
      );
      rg.addColorStop(0, withAlpha(light.color, 0.22 * light.intensity));
      rg.addColorStop(1, withAlpha(light.color, 0));
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.ellipse(light.x, light.y + 110, light.radius * 0.55, light.radius * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function withAlpha(hex: string, alpha: number): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Draws the reusable mock world (buildings, street, lights, hazard footprints). */
export function drawMockScene(ctx: CanvasRenderingContext2D, scene: SceneContext, t: number): void {
  fillSky(ctx, scene);
  drawDistantCity(ctx, t, scene);
  drawBuildings(ctx, t);
  drawStreet(ctx, scene);
  drawHazardMarkers(ctx, scene);
  drawLightPools(ctx, scene, t);
  drawNeonSigns(ctx, t, scene);
}
