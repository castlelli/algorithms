// The geometry of pme3100/optativa-5/codigo/modelo.py, redone in the browser, and the checks of
// verificacao.py with the same keys, grids and tolerances.
//
// Hypocycloid: a disk of radius r rolls inside a ring of radius R. With a = R − r and k = a/r,
//   P(θ) = (a cos θ + r cos kθ,  a sin θ − r sin kθ),   |P′| = 2a|sin(Rθ/2r)|,
//   ρ = 4r(R − r)/|R − 2r| · |sin(Rθ/2r)|.
// Twisted cubic: r(λ) = (λ, λ², λ³) with its Frenet frame, curvature and torsion.

export const MAX_DEN = 1000;
export const TOL = { ident: 1e-9, deriv: 1e-6, integ: 1e-6 };
const CUSP_MARGIN = 1e-2;

// ------------------------------------------------------------------------- vectors
export const add = (u, v) => u.map((x, i) => x + v[i]);
export const sub = (u, v) => u.map((x, i) => x - v[i]);
export const scale = (u, s) => u.map((x) => x * s);
export const dot = (u, v) => u.reduce((s, x, i) => s + x * v[i], 0);
export const norm = (u) => Math.hypot(...u);
export const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
export const linspace = (a, b, n) => Array.from({ length: n }, (_, i) => (n === 1 ? a : a + ((b - a) * i) / (n - 1)));

/** p/q = x with q ≤ maxDen (continued fractions), or null: the curve then never closes. */
export function rationalize(x, maxDen = MAX_DEN) {
  let [h0, h1, k0, k1] = [0, 1, 1, 0];
  let rest = x;
  for (let i = 0; i < 64; i++) {
    const a = Math.floor(rest);
    const k2 = k0 + a * k1;
    if (k2 > maxDen) break;
    [h0, h1, k0, k1] = [h1, h0 + a * h1, k1, k2];
    const frac = rest - a;
    if (frac < 1e-12) break;
    rest = 1 / frac;
  }
  if (!k1 || Math.abs(h1 / k1 - x) > 1e-9 * Math.abs(x)) return null;
  return [h1, k1];
}

// --------------------------------------------------------------------- hypocycloid
export function hypocycloid(R, r) {
  if (!(r > 0) || !Number.isFinite(R) || !Number.isFinite(r)) throw new Error("r > 0");
  if (!(R > r)) throw new Error("R > r");
  const a = R - r;
  const k = a / r;
  const pq = rationalize(R / r);
  const closes = pq !== null;
  const [p, q] = pq ?? [0, 0];
  const degenerate = Math.abs(R - 2 * r) <= 1e-12 * R;
  const rhoMax = degenerate ? Infinity : (4 * r * a) / Math.abs(R - 2 * r);

  const h = {
    R, r, a, k, p, q, closes, degenerate, rhoMax,
    thetaMax: closes ? 2 * Math.PI * q : Infinity,
    arcCusp: (8 * r * a) / R,
    get length() { return p * h.arcCusp; },
    pos: (t) => [a * Math.cos(t) + r * Math.cos(k * t), a * Math.sin(t) - r * Math.sin(k * t)],
    d1: (t) => [-a * (Math.sin(t) + Math.sin(k * t)), a * (Math.cos(t) - Math.cos(k * t))],
    d2: (t) => [-a * (Math.cos(t) + k * Math.cos(k * t)), -a * (Math.sin(t) - k * Math.sin(k * t))],
    center: (t) => [a * Math.cos(t), a * Math.sin(t)],
    contact: (t) => [R * Math.cos(t), R * Math.sin(t)],
    sinHalf: (t) => Math.sin((R * t) / (2 * r)),
    cross(t) {
      const v = h.d1(t);
      const w = h.d2(t);
      return v[0] * w[1] - v[1] * w[0];
    },
    /** General formula |P′|³/|x′y″ − y′x″|. */
    rho(t) {
      if (degenerate) return Infinity;
      const c = Math.abs(h.cross(t));
      const s = norm(h.d1(t));
      return c === 0 ? (s === 0 ? 0 : Infinity) : s ** 3 / c;
    },
    rhoClosed: (t) => (degenerate ? Infinity : rhoMax * Math.abs(h.sinHalf(t))),
    /** τ along increasing θ and n towards the centre of curvature. */
    frame(t) {
      const v = h.d1(t);
      const s = norm(v);
      const tau = [v[0] / s, v[1] / s];
      const sg = Math.sign(h.cross(t));
      return { tau, n: [-sg * tau[1], sg * tau[0]] };
    },
    curvatureCenter(t) {
      const { n } = h.frame(t);
      return add(h.pos(t), scale(n, h.rhoClosed(t)));
    },
    /** Cusp angles θ_m = 2πm r/R in [0, upTo]. */
    cusps(upTo = h.thetaMax) {
      const step = (2 * Math.PI * r) / R;
      const n = Math.floor(upTo / step + 1e-9);
      return Array.from({ length: n + 1 }, (_, m) => m * step);
    },
    /** The j-th of n points sits in arc (j − 1) mod arcs, at fraction j/(n + 1) of it (sorted). */
    safePoints(n, upTo = h.thetaMax) {
      let c = h.cusps(upTo);
      if (c[c.length - 1] < upTo - 1e-12) c = [...c, upTo];
      const arcs = c.length - 1;
      const out = [];
      for (let j = 1; j <= n; j++) {
        const i = (j - 1) % arcs;
        out.push(c[i] + ((c[i + 1] - c[i]) * j) / (n + 1));
      }
      return out.sort((x, y) => x - y);
    },
  };
  return h;
}

/** Item 1.7: θ = ωt, v = ωP′, a = ω²P″, and a = a_t τ + a_n n. */
export function instant(h, omega, t) {
  const theta = omega * t;
  const v = scale(h.d1(theta), omega);
  const acc = scale(h.d2(theta), omega * omega);
  const speed = norm(v);
  const atCusp = Math.abs(h.sinHalf(theta)) < 1e-12;
  const { tau, n } = atCusp ? { tau: [NaN, NaN], n: [NaN, NaN] } : h.frame(theta);
  return {
    t, theta, pos: h.pos(theta), v, a: acc, speed, atCusp,
    at: dot(acc, tau), an: h.degenerate ? 0 : dot(acc, n), rho: h.rhoClosed(theta), tau, n,
  };
}

// --------------------------------------------------------------------- twisted cubic
export const cubic = {
  pos: (l) => [l, l * l, l * l * l],
  d1: (l) => [1, 2 * l, 3 * l * l],
  d2: (l) => [0, 2, 6 * l],
  d3: () => [0, 0, 6],
  frenet(l) {
    const r1 = cubic.d1(l);
    const r2 = cubic.d2(l);
    const c = cross(r1, r2);
    const n1 = norm(r1);
    const nc = norm(c);
    const tau = scale(r1, 1 / n1);
    const b = scale(c, 1 / nc);
    const n = cross(b, tau);
    const kappa = nc / n1 ** 3;
    return { lambda: l, pos: cubic.pos(l), tau, n, b, kappa, rho: 1 / kappa, torsion: dot(c, cubic.d3()) / nc ** 2 };
  },
  rhoClosed: (l) => (1 + 4 * l * l + 9 * l ** 4) ** 1.5 / (2 * Math.sqrt(1 + 9 * l * l + 9 * l ** 4)),
  torsionClosed: (l) => 3 / (1 + 9 * l * l + 9 * l ** 4),
};

// ------------------------------------------------------------------------- checks
/** Five-point central difference, O(h⁴); f returns an array. */
export function derivative(f, x, step) {
  const [a, b, c, d] = [-2, -1, 1, 2].map((s) => f(x + s * step));
  return a.map((_, i) => (a[i] - 8 * b[i] + 8 * c[i] - d[i]) / (12 * step));
}

let gaussCache = null;
/** Gauss–Legendre nodes and weights (n = 40) by Newton on P_n. */
function gauss(n = 40) {
  if (gaussCache) return gaussCache;
  const x = [];
  const w = [];
  for (let i = 1; i <= n; i++) {
    let z = Math.cos((Math.PI * (i - 0.25)) / (n + 0.5));
    let dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1;
      let p1 = z;
      for (let j = 2; j <= n; j++) [p0, p1] = [p1, ((2 * j - 1) * z * p1 - (j - 1) * p0) / j];
      dp = (n * (z * p1 - p0)) / (z * z - 1);
      const dz = p1 / dp;
      z -= dz;
      if (Math.abs(dz) < 1e-16) break;
    }
    x.push(z);
    w.push(2 / ((1 - z * z) * dp * dp));
  }
  gaussCache = { x, w };
  return gaussCache;
}

export function grid(h, n = 2000) {
  const tm = h.closes ? h.thetaMax : 8 * Math.PI;
  return linspace(0, tm, n).filter((t) => Math.abs(h.sinHalf(t)) > CUSP_MARGIN);
}

const maxOf = (list, f) => list.reduce((m, x) => Math.max(m, f(x)), 0);

export function measureHypocycloid(h, omega) {
  const th = grid(h);
  const out = {};
  out.tau_unitario = maxOf(th, (t) => Math.abs(norm(h.frame(t).tau) - 1));
  out.tau_n = maxOf(th, (t) => {
    const f = h.frame(t);
    return Math.abs(dot(f.tau, f.n));
  });
  if (!h.degenerate) {
    out.rho_fechado = maxOf(th, (t) => Math.abs(h.rho(t) - h.rhoClosed(t)) / h.rhoClosed(t));
    out.frenet_plano = maxOf(th, (t) => {
      const dtau = derivative((x) => h.frame(x).tau, t, 1e-4);
      const s = norm(h.d1(t));
      const rho = h.rhoClosed(t);
      const { n } = h.frame(t);
      return norm(sub(scale(dtau, 1 / s), scale(n, 1 / rho))) * rho;
    });
  }
  const vMax = maxOf(th, (t) => norm(h.d1(t)));
  out.rolamento = Math.max(
    maxOf(th, (t) => Math.abs(dot(sub(h.pos(t), h.contact(t)), h.d1(t)))) / (vMax * h.R),
    maxOf(th, (t) => Math.abs(h.k * norm(sub(h.pos(t), h.contact(t))) - norm(h.d1(t)))) / vMax,
  );
  const T = 1e-3 / (omega * Math.max(h.k, 1));
  const pos = (tt) => h.pos(omega * tt);
  const vel = (tt) => scale(h.d1(omega * tt), omega);
  const vA = th.map((t) => scale(h.d1(t), omega));
  const aA = th.map((t) => scale(h.d2(t), omega * omega));
  const vScale = Math.max(...vA.map(norm));
  const aScale = Math.max(...aA.map(norm));
  out.derivada_v = maxOf(th.map((t, i) => i), (i) => norm(sub(derivative(pos, th[i] / omega, T), vA[i]))) / vScale;
  out.derivada_a = maxOf(th.map((t, i) => i), (i) => norm(sub(derivative(vel, th[i] / omega, T), aA[i]))) / aScale;
  out.intrinseca = maxOf(th.map((t, i) => i), (i) => {
    const { tau, n } = h.frame(th[i]);
    const a = aA[i];
    return norm(sub(add(scale(tau, dot(a, tau)), scale(n, dot(a, n))), a));
  }) / aScale;
  if (!h.degenerate) {
    out.an_rho = maxOf(th.map((t, i) => i), (i) => {
      const { n } = h.frame(th[i]);
      return Math.abs(dot(aA[i], n) - norm(vA[i]) ** 2 / h.rhoClosed(th[i]));
    }) / aScale;
  }
  if (h.closes) {
    out.fecha = norm(sub(h.pos(h.thetaMax), h.pos(0))) / h.R;
    const { x, w } = gauss();
    const c = h.cusps();
    let total = 0;
    for (let i = 0; i + 1 < c.length; i++) {
      const [a, b] = [c[i], c[i + 1]];
      for (let j = 0; j < x.length; j++) total += 0.5 * (b - a) * w[j] * norm(h.d1(0.5 * (b - a) * x[j] + 0.5 * (a + b)));
    }
    out.comprimento = Math.abs(total - h.length) / h.length;
  }
  return out;
}

export function measureCubic(lambdas) {
  const pts = [...lambdas, ...linspace(-1.5, 1.5, 31)];
  const out = { frenet_ortonormal: 0, frenet_direto: 0, rho_3d: 0, torcao: 0, serret_tau: 0, serret_b: 0 };
  for (const l of pts) {
    const f = cubic.frenet(l);
    const M = [f.tau, f.n, f.b];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out.frenet_ortonormal = Math.max(out.frenet_ortonormal, Math.abs(dot(M[i], M[j]) - (i === j ? 1 : 0)));
    out.frenet_direto = Math.max(out.frenet_direto, norm(sub(cross(f.tau, f.n), f.b)));
    out.rho_3d = Math.max(out.rho_3d, Math.abs(f.rho - cubic.rhoClosed(l)) / f.rho);
    out.torcao = Math.max(out.torcao, Math.abs(f.torsion - cubic.torsionClosed(l)) / Math.abs(f.torsion));
    const ds = norm(cubic.d1(l));
    const dtau = scale(derivative((x) => cubic.frenet(x).tau, l, 1e-3), 1 / ds);
    const db = scale(derivative((x) => cubic.frenet(x).b, l, 1e-3), 1 / ds);
    out.serret_tau = Math.max(out.serret_tau, norm(sub(dtau, scale(f.n, f.kappa))) / f.kappa);
    out.serret_b = Math.max(out.serret_b, norm(add(db, scale(f.n, f.torsion))) / Math.max(f.torsion, f.kappa));
  }
  return out;
}

export function verify(R, r, omega, lambdas) {
  return { ...measureHypocycloid(hypocycloid(R, r), omega), ...measureCubic(lambdas) };
}
