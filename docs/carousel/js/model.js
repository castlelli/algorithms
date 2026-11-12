// The carousel-and-ant kinematics, mirrored from pme3100/optativa-6/codigo/modelo.py.
// r = R − ∫v and φ = φ₀ + ∫ω are integrated by Gauss–Legendre quadrature on a fine grid
// (where Python has sympy's closed form); α and v̇ are exact derivatives of the typed expressions.

import { ExpressionError, compile, derive, hasT, parse } from "./expr.js";

export const VELOCITIES = ["v_rel", "v_arr", "v_abs"];
export const ACCELERATIONS = ["a_rel", "a_arr", "a_cor", "a_abs"];
export const TABLE_ROWS = ["v_rel", "v_arr", "v_abs", "a_rel", "a_arr", "a_arr_t", "a_arr_n", "a_cor", "a_abs"];
export const LARGEST_ARROW = 0.6; // the largest vector of each group is drawn 0.6 R long (animacao.FRACAO_MAIOR_VETOR)

const STEP = 1 / 400; // quadrature cell [s]
const CHECK_POINTS = 20001; // _PONTOS_VALIDACAO
const V_NEGATIVE_TOL = 1e-12;
const GL3 = [[-Math.sqrt(3 / 5), 5 / 9], [0, 8 / 9], [Math.sqrt(3 / 5), 5 / 9]];
const GL5 = [
  [0, 128 / 225],
  [-Math.sqrt(5 - 2 * Math.sqrt(10 / 7)) / 3, (322 + 13 * Math.sqrt(70)) / 900],
  [Math.sqrt(5 - 2 * Math.sqrt(10 / 7)) / 3, (322 + 13 * Math.sqrt(70)) / 900],
  [-Math.sqrt(5 + 2 * Math.sqrt(10 / 7)) / 3, (322 - 13 * Math.sqrt(70)) / 900],
  [Math.sqrt(5 + 2 * Math.sqrt(10 / 7)) / 3, (322 - 13 * Math.sqrt(70)) / 900],
];

const g4 = (x) => String(Number(x.toPrecision(4))).replace(".", ",").replace("-", "−");

function quad(f, a, b, rule) {
  const half = (b - a) / 2;
  const mid = (a + b) / 2;
  let sum = 0;
  for (const [x, w] of rule) sum += w * f(mid + half * x);
  return sum * half;
}

function constant(text, name) {
  if (typeof text === "number") {
    if (!Number.isFinite(text)) throw new ExpressionError(`${name} = ${text}: deve ser um número finito.`);
    return text;
  }
  return compile(parse(text, name, false))(0);
}

function checkFinite(fns, t0, t1) {
  for (const [name, f] of Object.entries(fns)) {
    for (let i = 0; i < CHECK_POINTS; i++) {
      const t = t0 + ((t1 - t0) * i) / (CHECK_POINTS - 1);
      if (!Number.isFinite(f(t))) throw new ExpressionError(`${name} não é finita/real em t ≈ ${g4(t)} s; revise a expressão.`);
    }
  }
}

/**
 * Solves the problem for { omega, v, R, phi0, dt, t?, tmax? }; omega and v are strings in t.
 * Throws ExpressionError with the same messages as the Python program.
 */
export function createMotion(params) {
  const tmax = params.tmax ?? 60;
  const R = constant(params.R, "R");
  const phi0 = constant(params.phi0, "φ₀");
  const dt = Number(params.dt);
  if (!(R > 0)) throw new ExpressionError(`R = ${params.R}: o raio do carrossel deve ser positivo.`);
  if (!(Number.isFinite(dt) && dt > 0)) throw new ExpressionError(`Δt = ${params.dt}: o intervalo de exibição deve ser positivo.`);

  const omegaTree = parse(params.omega, "ω");
  const vTree = parse(params.v, "v");
  const omega = compile(omegaTree);
  const v = compile(vTree);
  const alpha = compile(derive(omegaTree));
  const vdot = compile(derive(vTree));
  checkFinite({ ω: omega, v }, 0, tmax);

  // Cumulative integrals at the cell edges, until r crosses zero (or t_max).
  const intV = [0];
  const intW = [0];
  let crossing = -1;
  const cells = Math.ceil(tmax / STEP);
  for (let i = 0; i < cells; i++) {
    const a = i * STEP;
    const b = Math.min(tmax, a + STEP);
    intV.push(intV[i] + quad(v, a, b, GL3));
    intW.push(intW[i] + quad(omega, a, b, GL3));
    if (R - intV[i + 1] <= 0) {
      crossing = i + 1;
      break;
    }
  }
  const last = intV.length - 1;
  const cellOf = (t) => Math.max(0, Math.min(last - 1, Math.floor(t / STEP)));
  const integral = (cum, f, t) => {
    const i = cellOf(t);
    const a = i * STEP;
    return cum[i] + (t === a ? 0 : quad(f, a, t, GL5));
  };
  const r = (t) => R - integral(intV, v, t);
  const phi = (t) => phi0 + integral(intW, omega, t);

  let tf = tmax;
  const arrived = crossing > 0;
  if (arrived) {
    // Root of r in the crossing cell, by bisection down to the spacing of doubles.
    let a = (crossing - 1) * STEP;
    let b = Math.min(tmax, crossing * STEP);
    if (r(b) === 0) tf = b;
    else {
      for (let k = 0; k < 80; k++) {
        const c = (a + b) / 2;
        if (c <= a || c >= b) break;
        if (r(c) > 0) a = c;
        else b = c;
      }
      tf = Math.abs(r(a)) < Math.abs(r(b)) ? a : b;
    }
  }

  checkFinite({ "α = dω/dt": alpha, "dv/dt": vdot }, 0, tf);
  for (let i = 0; i < CHECK_POINTS; i++) {
    const t = (tf * i) / (CHECK_POINTS - 1);
    const value = v(t);
    if (value < -V_NEGATIVE_TOL) {
      throw new ExpressionError(
        `v(t) = "${params.v}" fica negativa em t ≈ ${g4(t)} s (v = ${g4(value)} m/s). ` +
          "v é o módulo da velocidade da formiga rumo ao centro e precisa ser ≥ 0 até ela chegar lá.",
      );
    }
  }

  let tInstant = params.t ?? null;
  if (tInstant === null || tInstant === "") tInstant = tf / 2;
  tInstant = Number(tInstant);
  if (!(tInstant >= 0 && tInstant <= tf)) {
    throw new ExpressionError(`t = ${params.t} s fora do movimento: use 0 ≤ t ≤ t_f = ${g4(tf)} s.`);
  }

  const motion = {
    params, R, phi0, dt, tmax, tf, arrived, tInstant,
    omega, v, alpha, vdot, r, phi, omegaTree, vTree,
    omegaConstant: !hasT(omegaTree),
    vConstant: !hasT(vTree),
    state: (t) => state(motion, t),
    group: (t) => group(t, dt),
  };
  motion.scales = scales(motion);
  return motion;
}

/** Velocities and accelerations of modelo.Movimento.estado, components in (e_r, e_φ). */
export function state(m, t) {
  const r = m.r(t);
  const phi = m.phi(t);
  const w = m.omega(t);
  const a = m.alpha(t);
  const v = m.v(t);
  const vd = m.vdot(t);
  const vec = {
    v_rel: [-v, 0],
    v_arr: [0, w * r],
    a_rel: [-vd, 0],
    a_arr_t: [0, a * r],
    a_arr_n: [-w * w * r, 0],
    a_cor: [0, -2 * w * v],
  };
  vec.v_abs = [vec.v_rel[0] + vec.v_arr[0], vec.v_rel[1] + vec.v_arr[1]];
  vec.a_arr = [vec.a_arr_t[0] + vec.a_arr_n[0], vec.a_arr_t[1] + vec.a_arr_n[1]];
  vec.a_abs = [vec.a_rel[0] + vec.a_arr[0] + vec.a_cor[0], vec.a_rel[1] + vec.a_arr[1] + vec.a_cor[1]];
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  return {
    t, r, phi, omega: w, alpha: a, v, vdot: vd, vec,
    pos: [r * c, r * s],
    cart: (name) => toCart(vec[name], c, s),
  };
}

export function toCart([er, ephi], c, s) {
  return [er * c - ephi * s, er * s + ephi * c];
}

export const norm = ([x, y]) => Math.hypot(x, y);

/** "vel" when ⌊t/Δt⌋ is even, "acc" when odd (modelo.grupo_no_instante). */
export function group(t, dt) {
  const k = Math.floor(t / dt + 1e-9);
  return k % 2 === 0 ? "vel" : "acc";
}

/** Fixed arrow scales of animacao.Escalas: metres of arrow per m/s and per m/s². */
function scales(m) {
  let vMax = 0;
  let aMax = 0;
  for (let i = 0; i < 4001; i++) {
    const e = state(m, (m.tf * i) / 4000);
    for (const n of VELOCITIES) vMax = Math.max(vMax, norm(e.vec[n]));
    for (const n of ACCELERATIONS) aMax = Math.max(aMax, norm(e.vec[n]));
  }
  const target = LARGEST_ARROW * m.R;
  return { vel: vMax > 0 ? target / vMax : 1, acc: aMax > 0 ? target / aMax : 1, vMax, aMax };
}

export function scaleOf(m, name) {
  return name.startsWith("v") ? m.scales.vel : m.scales.acc;
}

/** Absolute positions sampled over [0, t_f]. */
export function trajectory(m, samples = 900) {
  const out = new Float64Array(2 * (samples + 1));
  for (let i = 0; i <= samples; i++) {
    const t = (m.tf * i) / samples;
    const r = m.r(t);
    const p = m.phi(t);
    out[2 * i] = r * Math.cos(p);
    out[2 * i + 1] = r * Math.sin(p);
  }
  return out;
}

/**
 * Integrates the ant in the ground frame from its true initial state, with the acceleration
 * a_rel + a_arr (+ a_cor when withCoriolis). The ant's own push −v̇ stays along its radial line;
 * a_arr and a_cor are written in terms of the integrated position and velocity, so
 * withCoriolis = true reproduces the exact motion and false shows what the Coriolis term does.
 */
export function integrateGroundFrame(m, withCoriolis, steps = 4000) {
  const deriv = (t, [x, y, vx, vy]) => {
    const p = m.phi(t);
    const c = Math.cos(p);
    const s = Math.sin(p);
    const w = m.omega(t);
    const al = m.alpha(t);
    const vd = m.vdot(t);
    let ax = -vd * c - al * y - w * w * x;
    let ay = -vd * s + al * x - w * w * y;
    if (withCoriolis) {
      // 2 ω k ∧ v_rel, with v_rel = ẋ − ω k ∧ x.
      const rx = vx + w * y;
      const ry = vy - w * x;
      ax += -2 * w * ry;
      ay += 2 * w * rx;
    }
    return [vx, vy, ax, ay];
  };
  const e0 = state(m, 0);
  const v0 = e0.cart("v_abs");
  let y = [e0.pos[0], e0.pos[1], v0[0], v0[1]];
  const h = m.tf / steps;
  const out = new Float64Array(2 * (steps + 1));
  out[0] = y[0];
  out[1] = y[1];
  for (let i = 0; i < steps; i++) {
    const t = i * h;
    const k1 = deriv(t, y);
    const k2 = deriv(t + h / 2, y.map((q, j) => q + (h / 2) * k1[j]));
    const k3 = deriv(t + h / 2, y.map((q, j) => q + (h / 2) * k2[j]));
    const k4 = deriv(t + h, y.map((q, j) => q + h * k3[j]));
    y = y.map((q, j) => q + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    out[2 * i + 2] = y[0];
    out[2 * i + 3] = y[1];
  }
  return { points: out, steps, h };
}

// ---------------------------------------------------------------------------- verification
// verificacao.py: composition against the chain-rule derivative, and the 5-point numeric
// derivative of the position and of v_abs.

const derivative5 = (f, t, h) => {
  const a = f(t - 2 * h);
  const b = f(t - h);
  const c = f(t + h);
  const d = f(t + 2 * h);
  return [0, 1].map((j) => (a[j] - 8 * b[j] + 8 * c[j] - d[j]) / (12 * h));
};

function directDerivatives(m, t) {
  const r = m.r(t);
  const p = m.phi(t);
  const w = m.omega(t);
  const a = m.alpha(t);
  const v = m.v(t);
  const vd = m.vdot(t);
  const c = Math.cos(p);
  const s = Math.sin(p);
  return {
    vel: [-v * c - r * w * s, -v * s + r * w * c],
    acc: [-vd * c + 2 * v * w * s - r * a * s - r * w * w * c, -vd * s - 2 * v * w * c + r * a * c - r * w * w * s],
  };
}

export function derivativeErrors(m, n = 600, h = 1e-3) {
  const ts = Array.from({ length: n }, (_, i) => 2 * h + ((m.tf - 4 * h) * i) / (n - 1));
  const vAbs = ts.map((t) => state(m, t).cart("v_abs"));
  const aAbs = ts.map((t) => state(m, t).cart("a_abs"));
  const vNum = ts.map((t) => derivative5((s) => state(m, s).pos, t, h));
  const aNum = ts.map((t) => derivative5((s) => state(m, s).cart("v_abs"), t, h));
  let refV = Math.max(...vAbs.map(norm));
  let refA = Math.max(...aAbs.map(norm));
  if (!(refV > 1e-12)) refV = 1;
  if (!(refA > 1e-12)) refA = 1;
  const errV = ts.map((_, i) => Math.hypot(vNum[i][0] - vAbs[i][0], vNum[i][1] - vAbs[i][1]) / refV);
  const errA = ts.map((_, i) => Math.hypot(aNum[i][0] - aAbs[i][0], aNum[i][1] - aAbs[i][1]) / refA);
  return { ts, errV, errA };
}

/** The checks of verificacao.verificar, keyed like the report: { key: value }. */
export function verify(m) {
  const out = {};
  let compV = 0;
  let compA = 0;
  let vMin = Infinity;
  for (let i = 0; i <= 2000; i++) {
    const t = (m.tf * i) / 2000;
    const e = state(m, t);
    const d = directDerivatives(m, t);
    const sv = [0, 1].map((j) => e.cart("v_rel")[j] + e.cart("v_arr")[j]);
    const sa = [0, 1].map((j) => e.cart("a_rel")[j] + e.cart("a_arr")[j] + e.cart("a_cor")[j]);
    compV = Math.max(compV, Math.abs(sv[0] - d.vel[0]), Math.abs(sv[1] - d.vel[1]));
    compA = Math.max(compA, Math.abs(sa[0] - d.acc[0]), Math.abs(sa[1] - d.acc[1]));
    vMin = Math.min(vMin, e.v);
  }
  const { errV, errA } = derivativeErrors(m);
  out.composicao_v = compV;
  out.composicao_a = compA;
  out.derivada_v = Math.max(...errV);
  out.derivada_a = Math.max(...errA);
  out.v_nao_negativa = Math.min(0, vMin);
  if (m.arrived) out.t_f = m.r(m.tf);
  if (m.omegaConstant && m.vConstant) {
    const w = m.omega(0);
    const v = m.v(0);
    let cor = 0;
    let arr = 0;
    let rel = 0;
    for (let i = 0; i <= 2000; i++) {
      const e = state(m, (m.tf * i) / 2000);
      cor = Math.max(cor, Math.abs(norm(e.vec.a_cor) - 2 * Math.abs(w) * v));
      arr = Math.max(arr, Math.abs(e.vec.a_arr[0] + w * w * e.r), Math.abs(e.vec.a_arr[1]));
      rel = Math.max(rel, ...e.vec.a_rel.map(Math.abs));
    }
    out.const_cor = cor;
    out.const_arr = arr;
    out.const_rel = rel;
    if (v > 0) out.const_tf = m.tf - m.R / v;
  }
  return out;
}

export { ExpressionError };
