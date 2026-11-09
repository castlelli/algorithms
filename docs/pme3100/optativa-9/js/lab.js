// Live laboratory: RK4 integration in real time with the mechanism, the phase portrait and x(t), v(t).

import { coefficients, defaultStep, detectPeriod, energy, forcingPeriod, potential, rk4Step, DIVERGENCE_LIMIT } from "./model.js";
import { Plot, fitCanvas, fmt, niceTicks, onResize, onThemeChange, pointerPosition, reducedMotion, theme, trimmed, watchVisibility, withAlpha } from "./ui.js";
import { playTrajectory } from "./audio.js";

const RING = 16384;
const MAX_STROBE = 3000;
const MAX_STEPS_PER_FRAME = 6000;

const CONTROLS = [
  { group: "Sistema", key: "m", symbol: "m", name: "massa", unit: "kg", min: 0.2, max: 5, step: 0.01 },
  { group: "Sistema", key: "k1", symbol: "k<sub>1</sub>", name: "mola linear", unit: "N/m", min: -2, max: 2, step: 0.01 },
  { group: "Sistema", key: "k2", symbol: "k<sub>2</sub>", name: "mola cúbica", unit: "N/m³", min: 0, max: 3, step: 0.01 },
  { group: "Sistema", key: "c", symbol: "c", name: "amortecedor", unit: "N·s/m", min: 0, max: 1, step: 0.005 },
  { group: "Força", key: "A", symbol: "A", name: "amplitude", unit: "N", min: 0, max: 1.5, step: 0.001 },
  { group: "Força", key: "omega", symbol: "ω", name: "frequência", unit: "rad/s", min: 0.2, max: 3, step: 0.01 },
  { group: "Partida", key: "x0", symbol: "x(0)", name: "posição", unit: "m", min: -2, max: 2, step: 0.001 },
  { group: "Partida", key: "v0", symbol: "ẋ(0)", name: "velocidade", unit: "m/s", min: -2.5, max: 2.5, step: 0.001 },
  { group: "Tempo", key: "tmax", symbol: "t<sub>máx</sub>", name: "observação", unit: "s", min: 10, max: 1000, step: 1 },
  { group: "Tempo", key: "speed", symbol: "ritmo", name: "da simulação", unit: "s/s", min: 0.5, max: 200, step: 0.5, log: true },
];

const CASE_NOTES = {
  A: "Período 5. Depois de um transiente irregular, o bloco repete o mesmo percurso a cada cinco períodos da força: sobram cinco pontos na seção de Poincaré.",
  B: "Sem força. O amortecimento leva o bloco ao repouso em x = +1 ou x = −1. Clique no espaço de fases para escolher de onde ele parte.",
  C: "Caos. A trajetória nunca se repete, e os pontos da seção de Poincaré desenham aos poucos o atrator estranho.",
  D: "Poço único (k₁ positivo). Qualquer partida termina na mesma órbita de período 1.",
  E: "Dois atratores. Com força fraca o bloco fica preso em um dos poços, e a partida decide em qual.",
  free: "Dados livres. Os controles são as entradas do enunciado: mude qualquer um e a integração continua do estado atual.",
};

export function createLab(report) {
  const root = document.getElementById("lab");
  const nodes = {
    cases: root.querySelector("[data-case-bar]"),
    note: root.querySelector("[data-case-note]"),
    controls: root.querySelector("[data-controls]"),
    mech: root.querySelector("#lab-mech"),
    phase: root.querySelector("#lab-phase"),
    xt: root.querySelector("#lab-x"),
    vt: root.querySelector("#lab-v"),
    play: root.querySelector("[data-play]"),
    reset: root.querySelector("[data-reset]"),
    listen: root.querySelector("[data-listen]"),
    status: root.querySelector("[data-status]"),
    readout: Object.fromEntries([...root.querySelectorAll("[data-readout]")].map((n) => [n.dataset.readout, n])),
  };

  const state = {
    params: { m: 1, k1: -1, k2: 1, c: 0.3, A: 0.37, omega: 1.2 },
    x0: 0.084,
    v0: 0,
    tmax: 314,
    speed: 8,
    caseKey: "A",
    running: !reducedMotion(),
    visible: true,
    limitActive: true,
    diverged: false,
  };

  const sim = { t: 0, tBase: 0, k: 0, h: 0.026, x: 0, v: 0, c: null, out: [0, 0], lastPeriodIndex: 0, debt: 0 };
  const ring = { t: new Float64Array(RING), x: new Float32Array(RING), v: new Float32Array(RING), head: 0, count: 0 };
  const strobe = { t: [], x: [], v: [] };
  const range = { x: 1.8, v: 1.8, targetX: 1.8, targetV: 1.8, seenX: 0, seenV: 0 };
  let regime = "";
  let dragging = false;
  let hover = null;
  let lastFrame = 0;
  const inputs = {};

  const phasePlot = new Plot(nodes.phase, { xLabel: "x [m]", yLabel: "ẋ [m/s]", margin: { left: 44, right: 12, top: 10, bottom: 32 } });
  const xPlot = new Plot(nodes.xt, { yLabel: "x [m]", xLabel: "t [s]", margin: { left: 44, right: 12, top: 10, bottom: 30 }, yTicks: 4, xTickFormat: (t) => trimmed(t, 0) });
  const vPlot = new Plot(nodes.vt, { yLabel: "ẋ [m/s]", xLabel: "t [s]", margin: { left: 44, right: 12, top: 10, bottom: 30 }, yTicks: 4, xTickFormat: (t) => trimmed(t, 0) });

  // ---------------------------------------------------------------- simulation

  function traceColor() {
    const colors = theme();
    return state.caseKey ? colors.cases[state.caseKey] : colors.free;
  }

  function retune() {
    sim.tBase = sim.t;
    sim.k = 0;
    sim.c = coefficients(state.params);
    sim.h = defaultStep(state.params, Math.max(Math.abs(sim.x), range.seenX), Math.max(Math.abs(sim.v), range.seenV));
    sim.lastPeriodIndex = periodIndex(sim.t);
    strobe.t.length = strobe.x.length = strobe.v.length = 0;
    regime = "";
  }

  function periodIndex(t) {
    return state.params.omega > 0 ? Math.floor((state.params.omega * t) / (2 * Math.PI) + 1e-9) : 0;
  }

  function restart() {
    sim.t = 0;
    sim.x = state.x0;
    sim.v = state.v0;
    sim.debt = 0;
    ring.head = ring.count = 0;
    range.seenX = Math.abs(state.x0);
    range.seenV = Math.abs(state.v0);
    state.limitActive = true;
    state.diverged = false;
    retune();
    push(0, sim.x, sim.v);
    if (state.params.omega > 0) pushStrobe(0, sim.x, sim.v);
    setStatus("");
  }

  function push(t, x, v) {
    ring.t[ring.head] = t;
    ring.x[ring.head] = x;
    ring.v[ring.head] = v;
    ring.head = (ring.head + 1) % RING;
    if (ring.count < RING) ring.count++;
  }

  function pushStrobe(t, x, v) {
    if (strobe.t.length >= MAX_STROBE) {
      strobe.t.shift();
      strobe.x.shift();
      strobe.v.shift();
    }
    strobe.t.push(t);
    strobe.x.push(x);
    strobe.v.push(v);
    updateRegime();
  }

  function updateRegime() {
    const p = state.params;
    if (p.A === 0) {
      regime = "sem força";
      return;
    }
    const count = strobe.t.length;
    if (count < 14) {
      regime = "medindo…";
      return;
    }
    const take = Math.min(count, 52);
    const points = new Float64Array(2 * take);
    for (let i = 0; i < take; i++) {
      points[2 * i] = strobe.x[count - take + i];
      points[2 * i + 1] = strobe.v[count - take + i];
    }
    const period = detectPeriod(points, 2e-3, Math.min(16, Math.floor(take / 3)));
    regime = period > 0 ? `período ${period}` : "sem repetição";
  }

  function advance(seconds) {
    sim.debt += seconds;
    let steps = Math.floor(sim.debt / sim.h);
    if (steps <= 0) return;
    if (steps > MAX_STEPS_PER_FRAME) {
      steps = MAX_STEPS_PER_FRAME;
      sim.debt = 0;
    } else {
      sim.debt -= steps * sim.h;
    }
    const period = forcingPeriod(state.params);
    for (let s = 0; s < steps; s++) {
      const tPrev = sim.t;
      const xPrev = sim.x;
      const vPrev = sim.v;
      rk4Step(tPrev, xPrev, vPrev, sim.h, sim.c, sim.out);
      sim.k++;
      sim.t = sim.tBase + sim.k * sim.h;
      sim.x = sim.out[0];
      sim.v = sim.out[1];
      if (!(Math.abs(sim.x) < DIVERGENCE_LIMIT && Math.abs(sim.v) < DIVERGENCE_LIMIT)) {
        state.diverged = true;
        state.running = false;
        setStatus("A solução divergiu. Reinicie ou mude os dados.");
        break;
      }
      push(sim.t, sim.x, sim.v);
      const ax = Math.abs(sim.x);
      const av = Math.abs(sim.v);
      if (ax > range.seenX) range.seenX = ax;
      if (av > range.seenV) range.seenV = av;
      if (state.params.omega > 0) {
        const index = periodIndex(sim.t);
        if (index > sim.lastPeriodIndex) {
          const f = Math.min(1, Math.max(0, (index * period - tPrev) / sim.h));
          pushStrobe(index * period, xPrev + f * (sim.x - xPrev), vPrev + f * (sim.v - vPrev));
          sim.lastPeriodIndex = index;
        }
      }
      if (state.limitActive && sim.t >= state.tmax) {
        state.limitActive = false;
        state.running = false;
        setStatus(`Tempo de observação de ${trimmed(state.tmax, 1)} s atingido. Continue para seguir além dele.`);
        break;
      }
    }
    syncTransport();
  }

  // ---------------------------------------------------------------- drawing

  function updateRanges() {
    const snap = (value) => Math.max(1.75, Math.ceil(value * 1.12 * 4) / 4);
    range.targetX = snap(range.seenX);
    range.targetV = snap(range.seenV);
    range.x += (range.targetX - range.x) * 0.18;
    range.v += (range.targetV - range.v) * 0.18;
  }

  function ringIndex(i) {
    return (ring.head - ring.count + i + 2 * RING) % RING;
  }

  function drawPhase() {
    const colors = theme();
    const color = traceColor();
    phasePlot.setView(-range.x, range.x, -range.v, range.v);
    const ctx = phasePlot.begin();
    phasePlot.zeroLines();
    phasePlot.clip(() => {
      const count = Math.min(ring.count, 7000);
      const first = ring.count - count;
      const bands = 14;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      for (let band = 0; band < bands; band++) {
        const from = first + Math.floor((count * band) / bands);
        const to = first + Math.floor((count * (band + 1)) / bands);
        if (to - from < 1) continue;
        ctx.strokeStyle = withAlpha(color, 0.08 + 0.92 * ((band + 1) / bands) ** 2);
        ctx.beginPath();
        for (let i = Math.max(first, from - 1); i < to; i++) {
          const j = ringIndex(i);
          const px = phasePlot.px(ring.x[j]);
          const py = phasePlot.py(ring.v[j]);
          if (i === Math.max(first, from - 1)) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      ctx.fillStyle = colors.ink;
      const total = strobe.t.length;
      for (let i = 0; i < total; i++) {
        ctx.globalAlpha = i === total - 1 ? 1 : 0.75;
        ctx.beginPath();
        ctx.arc(phasePlot.px(strobe.x[i]), phasePlot.py(strobe.v[i]), i === total - 1 ? 4 : 2.4, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const startX = phasePlot.px(state.x0);
      const startY = phasePlot.py(state.v0);
      ctx.strokeStyle = colors.ink2;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(startX - 5, startY);
      ctx.lineTo(startX + 5, startY);
      ctx.moveTo(startX, startY - 5);
      ctx.lineTo(startX, startY + 5);
      ctx.stroke();

      const px = phasePlot.px(sim.x);
      const py = phasePlot.py(sim.v);
      ctx.fillStyle = colors.surface;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, 2 * Math.PI);
      ctx.fill();

      if (hover && !dragging) {
        ctx.strokeStyle = colors.axis;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(hover[0] + 0.5, phasePlot.inner.top);
        ctx.lineTo(hover[0] + 0.5, phasePlot.inner.top + phasePlot.inner.height);
        ctx.moveTo(phasePlot.inner.left, hover[1] + 0.5);
        ctx.lineTo(phasePlot.inner.left + phasePlot.inner.width, hover[1] + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
    if (hover && !dragging) {
      ctx.font = `14px ${colors.mono}`;
      ctx.fillStyle = colors.ink2;
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      const { left, top, width } = phasePlot.inner;
      ctx.fillText(`partir de (${fmt(phasePlot.invX(hover[0]), 2)}; ${fmt(phasePlot.invY(hover[1]), 2)})`, left + width - 6, top + 5);
    }
  }

  function drawSeries(plot, values, half) {
    const colors = theme();
    const color = traceColor();
    const period = forcingPeriod(state.params);
    const span = Number.isFinite(period) ? Math.min(90, Math.max(30, 10 * period)) : 60;
    const end = Math.max(sim.t, span);
    plot.setView(end - span, end, -half, half);
    const ctx = plot.begin();
    plot.zeroLines();
    plot.clip(() => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.3;
      ctx.lineJoin = "round";
      ctx.beginPath();
      let started = false;
      const stride = Math.max(1, Math.floor(span / sim.h / 1800));
      for (let i = ring.count - 1; i >= 0; i -= stride) {
        const j = ringIndex(i);
        const t = ring.t[j];
        if (t < end - span - sim.h * stride) break;
        const px = plot.px(t);
        const py = plot.py(values[j]);
        if (started) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
        started = true;
      }
      ctx.stroke();

      const source = values === ring.x ? strobe.x : strobe.v;
      ctx.fillStyle = colors.ink;
      for (let i = strobe.t.length - 1; i >= 0 && strobe.t[i] >= end - span; i--) {
        ctx.beginPath();
        ctx.arc(plot.px(strobe.t[i]), plot.py(source[i]), 3, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
  }

  function drawMechanism() {
    const colors = theme();
    const color = traceColor();
    const { ctx, width, height } = fitCanvas(nodes.mech);
    ctx.clearRect(0, 0, width, height);
    const p = state.params;
    const force = p.A * Math.cos(p.omega * sim.t);
    const wallX = 18;
    const left = wallX + 92;
    const right = width - 70;
    const toPx = (x) => left + ((x + range.x) / (2 * range.x)) * (right - left);
    const blockX = toPx(Math.max(-range.x, Math.min(range.x, sim.x)));

    // --- spring, damper and block
    const top = 14;
    const ground = top + 82;
    const blockW = 56;
    const blockTop = top + 10;
    const blockBottom = ground - 9;
    const face = blockX - blockW / 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.strokeStyle = colors.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = wallX; x < width - 8; x += 9) {
      ctx.moveTo(x, ground + 6);
      ctx.lineTo(x + 5, ground);
    }
    for (let y = top; y < ground; y += 9) {
      ctx.moveTo(wallX - 6, y + 6);
      ctx.lineTo(wallX, y);
    }
    ctx.stroke();
    ctx.strokeStyle = colors.ink2;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(wallX, top - 2);
    ctx.lineTo(wallX, ground);
    ctx.lineTo(width - 8, ground);
    ctx.stroke();

    const springY = blockTop + 14;
    const coils = 13;
    const lead = 10;
    const usable = Math.max(6, face - wallX - 2 * lead);
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(wallX, springY);
    ctx.lineTo(wallX + lead, springY);
    for (let i = 0; i < coils * 2; i++) {
      const x = wallX + lead + ((i + 0.5) / (coils * 2)) * usable;
      ctx.lineTo(x, springY + (i % 2 === 0 ? -7 : 7));
    }
    ctx.lineTo(face - lead, springY);
    ctx.lineTo(face, springY);
    ctx.stroke();

    const damperY = blockBottom - 14;
    const mid = (wallX + face) / 2;
    ctx.beginPath();
    ctx.moveTo(wallX, damperY);
    ctx.lineTo(mid - 9, damperY);
    ctx.moveTo(mid + 9, damperY - 7);
    ctx.lineTo(mid - 9, damperY - 7);
    ctx.lineTo(mid - 9, damperY + 7);
    ctx.lineTo(mid + 9, damperY + 7);
    ctx.moveTo(mid + 1, damperY - 5);
    ctx.lineTo(mid + 1, damperY + 5);
    ctx.moveTo(mid + 1, damperY);
    ctx.lineTo(face, damperY);
    ctx.stroke();

    ctx.fillStyle = withAlpha(color, colors.dark ? 0.22 : 0.14);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(face, blockTop, blockW, blockBottom - blockTop, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = colors.surface;
    ctx.strokeStyle = colors.ink2;
    ctx.lineWidth = 1.4;
    for (const dx of [-16, 16]) {
      ctx.beginPath();
      ctx.arc(blockX + dx, ground - 5, 4.2, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = colors.ink;
    ctx.font = `italic 18px ${colors.sans}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("m", blockX, (blockTop + blockBottom) / 2);

    const reference = Math.max(p.A, 1e-9);
    const arrow = (force / reference) * 46;
    if (Math.abs(arrow) > 2) {
      const y = (blockTop + blockBottom) / 2;
      const from = arrow > 0 ? face + blockW + 3 : face + blockW + 3 - arrow;
      const to = arrow > 0 ? from + arrow : face + blockW + 3;
      const dir = Math.sign(to - from);
      ctx.strokeStyle = colors.ink;
      ctx.fillStyle = colors.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(from, y);
      ctx.lineTo(to - dir * 5, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(to, y);
      ctx.lineTo(to - dir * 8, y - 4.5);
      ctx.lineTo(to - dir * 8, y + 4.5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.font = `14px ${colors.mono}`;
    ctx.fillStyle = colors.ink2;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(`F(t) = ${fmt(force, 3)} N`, width - 10, top - 4);

    // --- potential well with the forcing tilt, on the same x axis as the block
    const wellTop = ground + 44;
    const wellBottom = height - 28;
    const samples = 160;
    let vMin = Infinity;
    for (let i = 0; i <= samples; i++) vMin = Math.min(vMin, potential(p, -range.x + (2 * range.x * i) / samples));
    const vEdge = Math.max(potential(p, range.x), vMin + 0.6);
    const tilt = p.A * range.x * 0.55;
    const lo = vMin - tilt - 0.08;
    const hi = Math.min(vEdge, vMin + 2.4) + tilt * 0.3;
    const toPy = (u) => wellBottom - ((u - lo) / (hi - lo)) * (wellBottom - wellTop);

    ctx.save();
    ctx.beginPath();
    ctx.rect(wallX, wellTop - 8, width - wallX - 8, wellBottom - wellTop + 10);
    ctx.clip();
    const curve = (tilted) => {
      ctx.beginPath();
      for (let i = 0; i <= samples; i++) {
        const x = -range.x + (2 * range.x * i) / samples;
        const u = potential(p, x) - (tilted ? force * x : 0);
        if (i === 0) ctx.moveTo(toPx(x), toPy(u));
        else ctx.lineTo(toPx(x), toPy(u));
      }
    };
    ctx.strokeStyle = colors.axis;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    curve(false);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = colors.ink2;
    ctx.lineWidth = 2;
    curve(true);
    ctx.stroke();
    const ballY = toPy(potential(p, sim.x) - force * sim.x) - 7.5;
    ctx.strokeStyle = withAlpha(color, 0.35);
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(blockX, ground + 2);
    ctx.lineTo(blockX, ballY - 8);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = colors.surface;
    ctx.beginPath();
    ctx.arc(blockX, ballY, 8, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(blockX, ballY, 6, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();

    ctx.font = `14px ${colors.mono}`;
    ctx.fillStyle = colors.ink3;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.strokeStyle = colors.grid;
    for (const tick of niceTicks(-range.x, range.x, 6)) {
      ctx.fillText(trimmed(tick), toPx(tick), wellBottom + 6);
      ctx.beginPath();
      ctx.moveTo(toPx(tick) + 0.5, wellBottom);
      ctx.lineTo(toPx(tick) + 0.5, wellBottom + 4);
      ctx.stroke();
    }
    ctx.font = `15px ${colors.sans}`;
    ctx.fillStyle = colors.ink2;
    ctx.textAlign = "left";
    ctx.fillText("energia potencial V(x) − F(t)·x", wallX + 8, ground + 12);
    ctx.textAlign = "right";
    ctx.fillText("x [m]", width - 10, wellBottom + 5);
  }

  function drawReadout() {
    const r = nodes.readout;
    r.t.textContent = fmt(sim.t, 1);
    r.x.textContent = fmt(sim.x, 3);
    r.v.textContent = fmt(sim.v, 3);
    r.e.textContent = fmt(energy(state.params, sim.x, sim.v), 3);
    r.h.textContent = fmt(sim.h, 4);
    r.regime.textContent = regime || "–";
  }

  function draw() {
    updateRanges();
    drawMechanism();
    drawPhase();
    drawSeries(xPlot, ring.x, range.x);
    drawSeries(vPlot, ring.v, range.v);
    drawReadout();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const elapsed = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (!state.visible) return;
    if (state.running) advance(elapsed * state.speed);
    draw();
  }

  // ---------------------------------------------------------------- controls

  function setStatus(text) {
    nodes.status.textContent = text;
  }

  function syncTransport() {
    nodes.play.textContent = state.running ? "Pausar" : sim.t > 0 ? "Continuar" : "Iniciar";
    nodes.play.setAttribute("aria-pressed", String(state.running));
  }

  function valueOf(key) {
    return key in state.params ? state.params[key] : state[key];
  }

  function sliderPosition(control, value) {
    return control.log ? Math.log(value / control.min) / Math.log(control.max / control.min) : (value - control.min) / (control.max - control.min);
  }

  function syncInputs() {
    for (const control of CONTROLS) {
      const value = valueOf(control.key);
      const { range: slider, number } = inputs[control.key];
      slider.value = String(Math.round(sliderPosition(control, value) * 1000));
      if (document.activeElement !== number) number.value = String(Number(value.toFixed(4)));
      slider.style.setProperty("--fill", `${Math.max(0, Math.min(1, sliderPosition(control, value))) * 100}%`);
    }
    for (const button of nodes.cases.querySelectorAll("button")) {
      const active = (button.dataset.case || null) === state.caseKey;
      button.setAttribute("aria-pressed", String(active));
    }
    nodes.note.textContent = CASE_NOTES[state.caseKey ?? "free"];
    root.style.setProperty("--trace", traceColor());
  }

  function applyControl(key, value) {
    const control = CONTROLS.find((item) => item.key === key);
    const clamped = Math.max(control.min, Math.min(control.max, value));
    if (key in state.params) {
      state.params[key] = clamped;
      state.caseKey = matchingCase();
      retune();
    } else if (key === "x0" || key === "v0") {
      state[key] = clamped;
      state.caseKey = matchingCase();
      restart();
    } else {
      state[key] = clamped;
      if (key === "tmax") state.limitActive = sim.t < clamped;
    }
    syncInputs();
  }

  function matchingCase() {
    for (const [key, item] of Object.entries(report.cases)) {
      const same = ["m", "k1", "k2", "c", "A", "omega"].every((name) => Math.abs(item[name] - state.params[name]) < 1e-9);
      if (same) return key;
    }
    return null;
  }

  function buildControls() {
    let group = null;
    let box = null;
    for (const control of CONTROLS) {
      if (control.group !== group) {
        group = control.group;
        box = document.createElement("fieldset");
        box.className = "control-group";
        box.innerHTML = `<legend>${group}</legend>`;
        nodes.controls.appendChild(box);
      }
      const row = document.createElement("div");
      row.className = "control";
      const id = `ctl-${control.key}`;
      row.innerHTML = `
        <label for="${id}"><span class="symbol">${control.symbol}</span><span class="name">${control.name}</span></label>
        <span class="field"><input id="${id}" type="number" inputmode="decimal" step="${control.step}" min="${control.min}" max="${control.max}"><span class="unit">${control.unit}</span></span>
        <input type="range" min="0" max="1000" step="1" aria-label="${control.symbol.replace(/<[^>]+>/g, "")} ${control.name}">`;
      box.appendChild(row);
      const number = row.querySelector('input[type="number"]');
      const slider = row.querySelector('input[type="range"]');
      inputs[control.key] = { number, range: slider };
      slider.addEventListener("input", () => {
        const f = Number(slider.value) / 1000;
        const raw = control.log ? control.min * (control.max / control.min) ** f : control.min + f * (control.max - control.min);
        applyControl(control.key, Math.round(raw / control.step) * control.step);
      });
      number.addEventListener("change", () => {
        const value = Number(number.value.replace(",", "."));
        if (Number.isFinite(value)) applyControl(control.key, value);
        number.value = String(Number(valueOf(control.key).toFixed(4)));
      });
    }
  }

  function buildCases() {
    for (const [key, item] of Object.entries(report.cases)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "case-chip";
      button.dataset.case = key;
      button.style.setProperty("--chip", `var(--case-${key.toLowerCase()})`);
      button.innerHTML = `<span class="case-letter">${key}</span><span class="case-title">${item.title}</span>`;
      button.addEventListener("click", () => loadCase(key));
      nodes.cases.appendChild(button);
    }
    const free = document.createElement("button");
    free.type = "button";
    free.className = "case-chip";
    free.dataset.case = "";
    free.style.setProperty("--chip", "var(--case-free)");
    free.innerHTML = `<span class="case-letter">∗</span><span class="case-title">Dados livres</span>`;
    free.addEventListener("click", () => {
      state.caseKey = null;
      syncInputs();
    });
    nodes.cases.appendChild(free);
  }

  function loadCase(key) {
    const item = report.cases[key];
    load({ params: item, x0: item.initial[0][0], v0: item.initial[0][1], tmax: Math.round(item.tmax * 10) / 10 });
  }

  // Replaces the data set and restarts from the initial condition.
  function load({ params, x0, v0, tmax, scroll = false }) {
    if (params) for (const name of ["m", "k1", "k2", "c", "A", "omega"]) if (name in params) state.params[name] = params[name];
    if (x0 !== undefined) state.x0 = x0;
    if (v0 !== undefined) state.v0 = v0;
    if (tmax !== undefined) state.tmax = Math.max(10, Math.min(1000, tmax));
    state.caseKey = matchingCase();
    restart();
    state.running = true;
    syncInputs();
    syncTransport();
    if (scroll) root.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  }

  function pickInitial(event) {
    const [px, py] = pointerPosition(event, nodes.phase);
    if (!phasePlot.contains(px, py)) return;
    state.x0 = Number(phasePlot.invX(px).toFixed(3));
    state.v0 = Number(phasePlot.invY(py).toFixed(3));
    restart();
    state.running = true;
    syncInputs();
    syncTransport();
  }

  nodes.phase.addEventListener("pointerdown", (event) => {
    dragging = true;
    nodes.phase.setPointerCapture(event.pointerId);
    pickInitial(event);
  });
  nodes.phase.addEventListener("pointermove", (event) => {
    const [px, py] = pointerPosition(event, nodes.phase);
    hover = phasePlot.contains(px, py) ? [px, py] : null;
    if (dragging) pickInitial(event);
  });
  nodes.phase.addEventListener("pointerup", () => (dragging = false));
  nodes.phase.addEventListener("pointercancel", () => (dragging = false));
  nodes.phase.addEventListener("pointerleave", () => (hover = null));

  nodes.play.addEventListener("click", () => {
    if (state.diverged) return;
    state.running = !state.running;
    if (state.running) setStatus("");
    syncTransport();
  });
  nodes.reset.addEventListener("click", () => {
    restart();
    state.running = true;
    syncTransport();
  });
  nodes.listen.addEventListener("click", () => {
    const seconds = playTrajectory(state.params, sim.x, sim.v, sim.t);
    setStatus(seconds ? "Som: x(t) acelerado até a força virar uma nota de 220 Hz." : "Som indisponível neste navegador.");
  });

  buildCases();
  buildControls();
  restart();
  syncInputs();
  syncTransport();
  watchVisibility(root, (visible) => (state.visible = visible));
  for (const canvas of [nodes.mech, nodes.phase, nodes.xt, nodes.vt]) onResize(canvas, draw);
  onThemeChange(() => {
    syncInputs();
    draw();
  });
  document.fonts?.ready.then(draw);
  requestAnimationFrame((now) => {
    lastFrame = now;
    frame(now);
  });

  return {
    load,
    loadCase,
    snapshot: () => ({ params: { ...state.params }, x0: state.x0, v0: state.v0, caseKey: state.caseKey }),
  };
}
