// Duffing oscillator: m x'' + c x' + k1 x + k2 x^3 = A cos(omega t).
// Same scheme as codigo/modelo.py: classic RK4 on the equation divided by m.

export const STEPS_PER_PERIOD = 200;
export const DIVERGENCE_LIMIT = 1e6;

export function coefficients(p) {
  return { d: p.c / p.m, a: p.k1 / p.m, b: p.k2 / p.m, g: p.A / p.m, w: p.omega };
}

export function forcingPeriod(p) {
  return p.omega > 0 ? (2 * Math.PI) / p.omega : Infinity;
}

export function energy(p, x, v) {
  return 0.5 * p.m * v * v + 0.5 * p.k1 * x * x + 0.25 * p.k2 * x * x * x * x;
}

export function potential(p, x) {
  return 0.5 * p.k1 * x * x + 0.25 * p.k2 * x * x * x * x;
}

// Step small against both the forcing period and the fastest spring oscillation.
export function defaultStep(p, x0, v0) {
  const { d, a, b } = coefficients(p);
  const amplitude = Math.max(Math.abs(x0), Math.abs(v0), 1);
  const stiffness = Math.abs(a) + 3 * Math.abs(b) * amplitude * amplitude;
  const springStep = (2 * Math.PI) / (Math.sqrt(stiffness) + d + 1e-12) / 100;
  return Math.min(forcingPeriod(p) / STEPS_PER_PERIOD, springStep);
}

// One RK4 step. Writes the new (x, v) into out[0], out[1].
export function rk4Step(t, x, v, h, c, out) {
  const { d, a, b, g, w } = c;
  const half = 0.5 * h;
  const f1 = g * Math.cos(w * t);
  const f2 = g * Math.cos(w * (t + half));
  const f4 = g * Math.cos(w * (t + h));

  const k1x = v;
  const k1v = f1 - d * v - a * x - b * x * x * x;
  let xs = x + half * k1x;
  const k2x = v + half * k1v;
  const k2v = f2 - d * k2x - a * xs - b * xs * xs * xs;
  xs = x + half * k2x;
  const k3x = v + half * k2v;
  const k3v = f2 - d * k3x - a * xs - b * xs * xs * xs;
  xs = x + h * k3x;
  const k4x = v + h * k3v;
  const k4v = f4 - d * k4x - a * xs - b * xs * xs * xs;

  out[0] = x + (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
  out[1] = v + (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
}

// Integrates from t = 0 to tmax; h is adjusted so the last step lands exactly on tmax.
export function integrate(p, x0, v0, tmax, h) {
  const c = coefficients(p);
  const target = h ?? defaultStep(p, x0, v0);
  const n = Math.max(1, Math.ceil(tmax / target - 1e-9));
  const step = tmax / n;
  const t = new Float64Array(n + 1);
  const x = new Float64Array(n + 1);
  const v = new Float64Array(n + 1);
  const out = [x0, v0];
  x[0] = x0;
  v[0] = v0;
  for (let k = 0; k < n; k++) {
    rk4Step(k * step, out[0], out[1], step, c, out);
    t[k + 1] = (k + 1) * step;
    x[k + 1] = out[0];
    v[k + 1] = out[1];
    if (!(Math.abs(out[0]) < DIVERGENCE_LIMIT)) break;
  }
  return { t, x, v, h: step };
}

// Poincare section: state at every forcing period. Returns [x0, v0, x1, v1, ...].
export function strobe(c, x0, v0, periods, stepsPerPeriod = STEPS_PER_PERIOD) {
  const period = (2 * Math.PI) / c.w;
  const h = period / stepsPerPeriod;
  const points = new Float64Array(2 * (periods + 1));
  const out = [x0, v0];
  points[0] = x0;
  points[1] = v0;
  for (let n = 0; n < periods; n++) {
    const start = n * period;
    for (let k = 0; k < stepsPerPeriod; k++) rk4Step(start + k * h, out[0], out[1], h, c, out);
    points[2 * n + 2] = out[0];
    points[2 * n + 3] = out[1];
  }
  return points;
}

// Smallest p such that the stroboscopic sequence repeats every p periods; 0 if none does.
export function detectPeriod(points, tolerance = 1e-5, maximum = 32) {
  const count = points.length / 2;
  for (let p = 1; p <= maximum && p < count; p++) {
    let worst = 0;
    for (let i = p; i < count; i++) {
      const dx = points[2 * i] - points[2 * (i - p)];
      const dv = points[2 * i + 1] - points[2 * (i - p) + 1];
      worst = Math.max(worst, Math.hypot(dx, dv));
      if (worst >= tolerance) break;
    }
    if (worst < tolerance) return p;
  }
  return 0;
}

// Largest Lyapunov exponent (Benettin): one tangent vector, renormalised every period.
// Generator so the caller can spread the work across frames; yields progress in [0, 1].
export function* lyapunovRun(c, x0, v0, discard, measure, stepsPerPeriod = STEPS_PER_PERIOD) {
  const { d, a, b, g, w } = c;
  const period = (2 * Math.PI) / w;
  const h = period / stepsPerPeriod;
  const y = [x0, v0, 1, 0];
  const k1 = [0, 0, 0, 0];
  const k2 = [0, 0, 0, 0];
  const k3 = [0, 0, 0, 0];
  const k4 = [0, 0, 0, 0];
  const field = (t, x, v, u, s, out) => {
    out[0] = v;
    out[1] = g * Math.cos(w * t) - d * v - a * x - b * x * x * x;
    out[2] = s;
    out[3] = -(a + 3 * b * x * x) * u - d * s;
  };
  let sum = 0;
  for (let n = 0; n < discard + measure; n++) {
    for (let k = 0; k < stepsPerPeriod; k++) {
      const t = n * period + k * h;
      field(t, y[0], y[1], y[2], y[3], k1);
      field(t + h / 2, y[0] + (h / 2) * k1[0], y[1] + (h / 2) * k1[1], y[2] + (h / 2) * k1[2], y[3] + (h / 2) * k1[3], k2);
      field(t + h / 2, y[0] + (h / 2) * k2[0], y[1] + (h / 2) * k2[1], y[2] + (h / 2) * k2[2], y[3] + (h / 2) * k2[3], k3);
      field(t + h, y[0] + h * k3[0], y[1] + h * k3[1], y[2] + h * k3[2], y[3] + h * k3[3], k4);
      for (let i = 0; i < 4; i++) y[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    }
    const norm = Math.hypot(y[2], y[3]);
    y[2] /= norm;
    y[3] /= norm;
    if (n >= discard) sum += Math.log(norm);
    if (n % 50 === 49) yield (n + 1) / (discard + measure);
  }
  return { lambda: sum / (measure * period), x: y[0], v: y[1] };
}

// Advances many independent trajectories in place, `steps` RK4 steps starting at step index k0.
export function advanceCloud(xs, vs, k0, steps, h, c) {
  const { d, a, b, g, w } = c;
  const half = 0.5 * h;
  const sixth = h / 6;
  const n = xs.length;
  for (let s = 0; s < steps; s++) {
    const t = (k0 + s) * h;
    const f1 = g * Math.cos(w * t);
    const f2 = g * Math.cos(w * (t + half));
    const f4 = g * Math.cos(w * (t + h));
    for (let i = 0; i < n; i++) {
      const x = xs[i];
      const v = vs[i];
      const k1v = f1 - d * v - a * x - b * x * x * x;
      let xm = x + half * v;
      const k2x = v + half * k1v;
      const k2v = f2 - d * k2x - a * xm - b * xm * xm * xm;
      xm = x + half * k2x;
      const k3x = v + half * k2v;
      const k3v = f2 - d * k3x - a * xm - b * xm * xm * xm;
      xm = x + h * k3x;
      const k4x = v + h * k3v;
      const k4v = f4 - d * k4x - a * xm - b * xm * xm * xm;
      xs[i] = x + sixth * (v + 2 * k2x + 2 * k3x + k4x);
      vs[i] = v + sixth * (k1v + 2 * k2v + 2 * k3v + k4v);
    }
  }
}

// Index of the attractor point nearest to (x, v), and its distance.
export function nearestPoint(points, x, v) {
  let best = -1;
  let distance = Infinity;
  points.forEach(([px, pv], i) => {
    const d = Math.hypot(px - x, pv - v);
    if (d < distance) {
      distance = d;
      best = i;
    }
  });
  return { index: best, distance };
}
