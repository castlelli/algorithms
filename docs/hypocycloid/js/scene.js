// Drawing of the rolling-disk scene, shared by the hero, the lab, the snapshots and the later
// sections: ring, trace of P, disk with spokes, instant centre and velocity direction.

import { arrow, dot2, label, polyline, theme, withAlpha } from "./ui.js";

const cache = new Map();

/** Points of the curve for θ in [0, upTo], cached per (R, r, upTo, n). */
export function curvePoints(h, upTo = h.thetaMax, n = null) {
  const count = n ?? Math.max(200, Math.min(6000, Math.round(160 * (upTo / (2 * Math.PI)) * Math.max(1, h.p / h.q || h.R / h.r))));
  const key = `${h.R}|${h.r}|${upTo}|${count}`;
  if (!cache.has(key)) {
    if (cache.size > 40) cache.clear();
    const pts = new Array(count + 1);
    for (let i = 0; i <= count; i++) pts[i] = h.pos((upTo * i) / count);
    cache.set(key, pts);
  }
  return cache.get(key);
}

export function drawRing(ctx, view, h, opts = {}) {
  const t = theme();
  const R = view.s * h.R;
  const [cx, cy] = view.pt([0, 0]);
  ctx.save();
  ctx.strokeStyle = t.c.ring;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.setLineDash([]);
  if (opts.ticks !== false) {
    // Drafting ticks every 15°, longer every 90°.
    ctx.lineWidth = 1;
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI) / 12;
      const len = i % 6 === 0 ? 9 : 4;
      ctx.beginPath();
      ctx.moveTo(cx + (R + 3) * Math.cos(a), cy - (R + 3) * Math.sin(a));
      ctx.lineTo(cx + (R + 3 + len) * Math.cos(a), cy - (R + 3 + len) * Math.sin(a));
      ctx.stroke();
    }
    ctx.strokeStyle = withAlpha(t.ink3, 0.6);
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy);
    ctx.lineTo(cx + 6, cy);
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx, cy + 6);
    ctx.stroke();
  }
  ctx.restore();
}

/** Curve through model points (θ from 0 to upTo). */
export function drawTrace(ctx, view, pts, color, width = 2, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  polyline(ctx, pts.map(view.pt));
  ctx.stroke();
  ctx.restore();
}

/** The trace up to θ, drawn from the cached full curve plus the exact end point. */
export function drawPartial(ctx, view, h, theta, color, width = 2.2) {
  const full = curvePoints(h);
  const n = full.length - 1;
  const upto = Math.min(n, Math.floor((theta / h.thetaMax) * n));
  const pts = full.slice(0, upto + 1);
  pts.push(h.pos(theta));
  drawTrace(ctx, view, pts, color, width);
}

export function drawCusps(ctx, view, h) {
  const t = theme();
  for (const c of h.cusps().slice(0, -1)) {
    const [x, y] = view.pt(h.pos(c));
    dot2(ctx, x, y, 3.6, t.surface, t.ink, 1.3);
  }
}

/** Disk at angle θ, with three spokes so its own rotation (−kθ) can be seen. */
export function drawDisk(ctx, view, h, theta, opts = {}) {
  const t = theme();
  const C = h.center(theta);
  const P = h.pos(theta);
  const [cx, cy] = view.pt(C);
  const [px, py] = view.pt(P);
  const rr = view.s * h.r;
  ctx.save();
  ctx.fillStyle = withAlpha(t.c.disk, t.dark ? 0.14 : 0.08);
  ctx.strokeStyle = t.c.disk;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, rr, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = withAlpha(t.c.disk, 0.45);
  for (let j = 1; j < 3; j++) {
    const ang = -h.k * theta + (2 * Math.PI * j) / 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + rr * Math.cos(ang), cy - rr * Math.sin(ang));
    ctx.stroke();
  }
  ctx.strokeStyle = t.c.disk;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(px, py);
  ctx.stroke();
  dot2(ctx, cx, cy, 2.4, t.c.disk);

  if (opts.contact) {
    const I = h.contact(theta);
    const [ix, iy] = view.pt(I);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = t.ink3;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(ix, iy);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.setLineDash([]);
    dot2(ctx, ix, iy, 4, t.surface, t.ink, 1.4);
    if (opts.labels) label(ctx, "I", "", ix + 7 * Math.cos(theta), iy - 7 * Math.sin(theta) - 2, t.ink, 13);
  }
  if (opts.velocity) {
    const v = h.d1(theta);
    const s = Math.hypot(v[0], v[1]);
    if (s > 1e-9) {
      const L = Math.min(0.3 * h.R, (0.3 * h.R * s) / (2 * h.a)) * view.s;
      arrow(ctx, px, py, px + (L * v[0]) / s, py - (L * v[1]) / s, t.c.v, 2.2);
      if (opts.labels && L > 18) label(ctx, "v", "P", px + ((L + 10) * v[0]) / s, py - ((L + 10) * v[1]) / s, t.c.v, 13);
    }
  }
  // The pen: a ring with a bright core.
  dot2(ctx, px, py, 6.5, withAlpha(t.c.pen, 0.22));
  dot2(ctx, px, py, 3.8, t.c.pen);
  if (opts.labels) label(ctx, "P", "", px + 8, py - 10, t.c.pen, 13);
  ctx.restore();
}

/** Full window for a hypocycloid scene (ring plus ticks). */
export const ringHalf = (h) => h.R * 1.1;
