// Top view of the carousel and the ant, drawn either from the ground (inertial frame) or
// riding the carousel (the camera turns with the disk, so the ant's radial line stays still).

import { scaleOf, state } from "./model.js";
import { arrow, theme, vectorLabel, withAlpha } from "./ui.js";

export const HALF_WINDOW = 1.72; // animacao.MEIA_JANELA, in units of R

/** Samples reused by every frame: times, absolute positions and the line angle φ. */
export function prepare(m, samples = 900) {
  const t = new Float64Array(samples + 1);
  const x = new Float64Array(samples + 1);
  const y = new Float64Array(samples + 1);
  const phi = new Float64Array(samples + 1);
  for (let i = 0; i <= samples; i++) {
    const ti = (m.tf * i) / samples;
    const r = m.r(ti);
    const p = m.phi(ti);
    t[i] = ti;
    phi[i] = p;
    x[i] = r * Math.cos(p);
    y[i] = r * Math.sin(p);
  }
  return { m, samples, t, x, y, phi };
}

const rotate = (x, y, angle) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c - y * s, x * s + y * c];
};

/**
 * opts: frame ("ground" | "carousel"), vectors (names to draw), faded (names drawn faint),
 * trail (bool), ghost ({ points, steps } from integrateGroundFrame, drawn dashed),
 * labels (bool), half (half window in metres), center ([cx, cy] in px), scale (px per metre).
 */
export function drawScene(ctx, w, h, prep, t, opts = {}) {
  const th = theme();
  const { m } = prep;
  const frame = opts.frame ?? "ground";
  const half = opts.half ?? HALF_WINDOW * m.R;
  const k = opts.scale ?? Math.min(w, h) / 2 / half;
  const [cx, cy] = opts.center ?? [w / 2, h / 2];
  const e = state(m, t);
  const turn = e.phi - m.phi0; // how far the disk has turned since t = 0
  const camera = frame === "carousel" ? -turn : 0;
  const toScreen = (x, y) => {
    const [rx, ry] = camera ? rotate(x, y, camera) : [x, y];
    return [cx + rx * k, cy - ry * k];
  };
  const R = m.R;

  // Ground axes: fixed from the ground, spinning backwards when riding the carousel.
  ctx.save();
  ctx.strokeStyle = th.grid;
  ctx.lineWidth = 1;
  for (const angle of [0, Math.PI / 2]) {
    const [x0, y0] = toScreen(-1.55 * R * Math.cos(angle), -1.55 * R * Math.sin(angle));
    const [x1, y1] = toScreen(1.55 * R * Math.cos(angle), 1.55 * R * Math.sin(angle));
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  if (opts.axisLabels !== false) {
    ctx.fillStyle = th.ink3;
    ctx.font = `500 11px ${th.mono}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const [xi, yi] = toScreen(1.63 * R, 0);
    const [xj, yj] = toScreen(0, 1.63 * R);
    ctx.fillText("x", xi, yi);
    ctx.fillText("y", xj, yj);
  }
  ctx.restore();

  // Disk, a coloured sector and spokes, all turning with ω.
  const [ox, oy] = toScreen(0, 0);
  const line = e.phi; // ground angle of the ant's radial line
  ctx.save();
  ctx.fillStyle = th.disk;
  ctx.beginPath();
  ctx.arc(ox, oy, R * k, 0, 2 * Math.PI);
  ctx.fill();
  const screenAngle = (a) => -(a + camera);
  ctx.fillStyle = th.sector;
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.arc(ox, oy, R * k, screenAngle(line + 2.6), screenAngle(line + 3.4), true);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = th.spoke;
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const a = screenAngle(line + Math.PI / 8 + (i * Math.PI) / 4);
    ctx.beginPath();
    ctx.moveTo(ox + 0.07 * R * k * Math.cos(a), oy + 0.07 * R * k * Math.sin(a));
    ctx.lineTo(ox + R * k * Math.cos(a), oy + R * k * Math.sin(a));
    ctx.stroke();
  }
  ctx.strokeStyle = th.diskRim;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(ox, oy, R * k, 0, 2 * Math.PI);
  ctx.stroke();
  // The ant's radial line, dashed.
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = th.ink3;
  ctx.lineWidth = 1.2;
  const [lx, ly] = toScreen(R * Math.cos(line), R * Math.sin(line));
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(lx, ly);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Trails: absolute path from the ground; a straight segment on the carousel.
  const upto = Math.min(prep.samples, Math.floor((t / m.tf) * prep.samples + 1e-9));
  const pathPoint = (i) => {
    if (frame === "ground") return toScreen(prep.x[i], prep.y[i]);
    const [rx, ry] = rotate(prep.x[i], prep.y[i], -(prep.phi[i] - m.phi0));
    return [cx + rx * k, cy - ry * k];
  };
  if (opts.fullPath) {
    ctx.save();
    ctx.strokeStyle = th.ghost;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i <= prep.samples; i++) {
      const [px, py] = pathPoint(i);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }
  if (opts.ghost) drawGhost(ctx, prep, opts.ghost, t, frame, cx, cy, k, th);
  if (opts.trail !== false && upto > 0) {
    ctx.save();
    ctx.lineWidth = opts.trailWidth ?? 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const chunks = 24;
    for (let c = 0; c < chunks; c++) {
      const i0 = Math.floor((c * upto) / chunks);
      const i1 = Math.floor(((c + 1) * upto) / chunks);
      if (i1 <= i0) continue;
      ctx.strokeStyle = withAlpha(opts.trailColor ?? th.ink, 0.18 + 0.82 * ((c + 1) / chunks) ** 1.5);
      ctx.beginPath();
      for (let i = i0; i <= i1; i++) {
        const [px, py] = pathPoint(i);
        if (i === i0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      // Ends exactly at the ant.
      if (c === chunks - 1) {
        const [ax, ay] = toScreen(e.pos[0], e.pos[1]);
        ctx.lineTo(ax, ay);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Centre O.
  ctx.save();
  ctx.fillStyle = th.surface;
  ctx.strokeStyle = th.ink;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(ox, oy, 4, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Vectors from the ant.
  const [ax, ay] = toScreen(e.pos[0], e.pos[1]);
  const tips = [];
  for (const name of opts.vectors ?? []) {
    const [vx, vy] = e.cart(name);
    const s = scaleOf(m, name);
    const [tx, ty] = toScreen(e.pos[0] + vx * s, e.pos[1] + vy * s);
    const faded = opts.faded?.includes(name);
    const important = name.endsWith("abs");
    arrow(ctx, ax, ay, tx, ty, th.vec[name], important ? 2.8 : 2.2, faded ? 0.22 : 1);
    if (opts.labels !== false && !faded && Math.hypot(tx - ax, ty - ay) > 14) tips.push({ name, tx, ty, ax, ay });
  }
  for (const { name, tx, ty } of tips) {
    const dx = tx - ax;
    const dy = ty - ay;
    const l = Math.hypot(dx, dy);
    vectorLabel(ctx, name, tx + (dx / l) * 9 - 6, ty + (dy / l) * 11, th.vec[name], 13);
  }

  drawAnt(ctx, ax, ay, toScreen, e, th, Math.max(5.5, 0.06 * R * k));
  return { toScreen, e, k };
}

function drawGhost(ctx, prep, ghost, t, frame, cx, cy, k, th) {
  const { m } = prep;
  const n = ghost.steps;
  const upto = Math.min(n, Math.floor((t / m.tf) * n + 1e-9));
  if (upto < 1) return;
  ctx.save();
  ctx.strokeStyle = th.vec.a_cor;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  for (let i = 0; i <= upto; i++) {
    let gx = ghost.points[2 * i];
    let gy = ghost.points[2 * i + 1];
    if (frame === "carousel") [gx, gy] = rotate(gx, gy, -(m.phi((i * m.tf) / n) - m.phi0));
    const px = cx + gx * k;
    const py = cy - gy * k;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  const gx = ghost.points[2 * upto];
  const gy = ghost.points[2 * upto + 1];
  const [hx, hy] = frame === "carousel" ? rotate(gx, gy, -(m.phi((upto * m.tf) / n) - m.phi0)) : [gx, gy];
  ctx.fillStyle = th.vec.a_cor;
  ctx.beginPath();
  ctx.arc(cx + hx * k, cy - hy * k, 4.5, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
}

/** A small ant facing the direction it walks (towards O, along its line). */
function drawAnt(ctx, x, y, toScreen, e, th, size) {
  const [hx, hy] = toScreen(e.pos[0] * 0.9, e.pos[1] * 0.9);
  const [px, py] = toScreen(e.pos[0], e.pos[1]);
  let heading = Math.atan2(hy - py, hx - px);
  if (!(e.r > 1e-9)) heading = 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.fillStyle = th.ink;
  ctx.strokeStyle = th.ink;
  ctx.lineWidth = Math.max(1, size * 0.13);
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    for (const [a, b] of [[-0.35, -0.95], [0.05, -0.15], [0.4, 0.75]]) {
      ctx.beginPath();
      ctx.moveTo(a * size * 0.6, 0);
      ctx.lineTo(b * size * 0.9, side * size * 0.85);
      ctx.stroke();
    }
  }
  const blob = (dx, rx, ry) => {
    ctx.beginPath();
    ctx.ellipse(dx * size, 0, rx * size, ry * size, 0, 0, 2 * Math.PI);
    ctx.fill();
  };
  blob(-0.62, 0.42, 0.3);
  blob(0, 0.26, 0.2);
  blob(0.48, 0.25, 0.23);
  ctx.beginPath();
  ctx.moveTo(0.66 * size, -0.08 * size);
  ctx.lineTo(1.0 * size, -0.42 * size);
  ctx.moveTo(0.66 * size, 0.08 * size);
  ctx.lineTo(1.0 * size, 0.42 * size);
  ctx.stroke();
  ctx.restore();
}
