// Sensitivity to initial conditions: two trajectories a tiny distance apart and their separation in time.

import { coefficients, forcingPeriod, integrate, strobe } from "./model.js";
import { Plot, createTooltip, offsetWithin, fmt, fmtSci, onResize, onThemeChange, pointerPosition, reducedMotion, superscript, theme, trimmed, watchVisibility } from "./ui.js";

const PERIODS = 60;
const REVEAL_SECONDS = 4.5;
const SEPARATED = 0.1;
const SETTLE_PERIODS = 50;
const ROUNDOFF = 1e-13;
const PAIRS = 48;
const PAIR_GAP = 7; // forcing periods between consecutive starting points
const FIT_CEILING = -4; // log10 of the distance where the fit stops

export function createButterfly(report, lab) {
  const root = document.getElementById("borboleta");
  const caseBar = root.querySelector("[data-butterfly-case]");
  const epsSelect = root.querySelector("[data-butterfly-eps]");
  const runButton = root.querySelector("[data-butterfly-run]");
  const tile = Object.fromEntries([...root.querySelectorAll("[data-tile]")].map((n) => [n.dataset.tile, n]));
  const xCanvas = root.querySelector("#butterfly-x");
  const dCanvas = root.querySelector("#butterfly-d");
  const host = root.querySelector(".pair");
  const tooltip = createTooltip(host);
  const margin = { left: 48, right: 14, top: 10, bottom: 32 };
  const xPlot = new Plot(xCanvas, { xLabel: "t [s]", yLabel: "x [m]", margin, xTickFormat: (t) => trimmed(t, 0) });
  const dPlot = new Plot(dCanvas, { xLabel: "t [s]", yLabel: "distância [m]", margin, xTickFormat: (t) => trimmed(t, 0), yTickFormat: (e) => `10${superscript(Math.round(e))}` });

  let source = "C";
  let run = null;
  let progress = 0;
  let started = 0;
  let hoverT = null;
  let visible = false;
  let pendingAuto = true;

  const options = [
    ["C", "Caso C"],
    ["A", "Caso A"],
    ["D", "Caso D"],
    ["lab", "Dados do laboratório"],
  ];
  for (const [key, label] of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.key = key;
    button.textContent = label;
    button.setAttribute("aria-pressed", String(key === source));
    button.addEventListener("click", () => {
      source = key;
      for (const other of caseBar.children) other.setAttribute("aria-pressed", String(other.dataset.key === key));
      start();
    });
    caseBar.appendChild(button);
  }

  function setup() {
    if (source === "lab") {
      const snapshot = lab.snapshot();
      return { params: snapshot.params, x0: snapshot.x0, v0: snapshot.v0, caseKey: snapshot.caseKey };
    }
    const item = report.cases[source];
    return { params: item, x0: item.initial[0][0], v0: item.initial[0][1], caseKey: source };
  }

  function start() {
    const { params, caseKey, x0, v0 } = setup();
    const eps = Number(epsSelect.value);
    const period = forcingPeriod(params);
    const forced = Number.isFinite(period) && params.A > 0;
    const tmax = Number.isFinite(period) ? Math.min(400, PERIODS * period) : 300;
    // Pairs start already in steady state, a few periods apart along the same orbit, so the
    // slope of the mean of ln d can be compared with the report's exponent.
    const starts = forced ? strobe(coefficients(params), x0, v0, SETTLE_PERIODS + PAIR_GAP * (PAIRS - 1)) : [x0, v0];
    const pairs = forced ? PAIRS : 1;
    let first = null;
    let second = null;
    let logDistance = null;
    let meanLog = null;
    let horizon = null;
    for (let pair = 0; pair < pairs; pair++) {
      const at = forced ? 2 * (SETTLE_PERIODS + PAIR_GAP * pair) : 0;
      const one = integrate(params, starts[at], starts[at + 1], tmax, first?.h);
      const two = integrate(params, starts[at] + eps, starts[at + 1], tmax, one.h);
      const n = one.t.length;
      meanLog ??= new Float64Array(n);
      const current = pair === 0 ? new Float64Array(n) : null;
      for (let i = 0; i < n; i++) {
        const d = Math.max(Math.hypot(one.x[i] - two.x[i], one.v[i] - two.v[i]), 1e-17);
        meanLog[i] += Math.log10(d) / pairs;
        if (current) {
          current[i] = Math.log10(d);
          if (horizon === null && d > SEPARATED) horizon = i;
        }
      }
      if (pair === 0) [first, second, logDistance] = [one, two, current];
    }

    // Fit window on the mean: from one decade above the start up to 0.1 mm when the pairs
    // separate (later the mean bends as pairs saturate); otherwise everything above round-off.
    const n = first.t.length;
    const start = Math.log10(eps);
    let from = 0;
    let to = n - 1;
    const grown = meanLog.findIndex((value) => value > Math.max(FIT_CEILING, start + 2));
    if (grown > 0) {
      from = Math.max(0, meanLog.findIndex((value) => value > start + 1));
      to = grown;
    } else {
      const floor = meanLog.findIndex((value) => value < Math.log10(ROUNDOFF));
      if (floor > 0) to = floor;
    }
    let st = 0;
    let sy = 0;
    let stt = 0;
    let sty = 0;
    for (let i = from; i <= to; i++) {
      const y = meanLog[i] * Math.LN10;
      st += first.t[i];
      sy += y;
      stt += first.t[i] * first.t[i];
      sty += first.t[i] * y;
    }
    const m = to - from + 1;
    const slope = (m * sty - st * sy) / (m * stt - st * st);
    const intercept = (sy - slope * st) / m;
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(first.x[i]), Math.abs(second.x[i]));
    run = { first, second, logDistance, meanLog, pairs, eps, tmax, horizon, slope, intercept, from, to, grows: grown > 0, caseKey, half: Math.max(1.75, Math.ceil(peak * 1.12 * 4) / 4) };
    progress = reducedMotion() ? 1 : 0;
    started = performance.now();
    writeTiles(progress >= 1);
    draw();
  }

  function writeTiles(finished) {
    if (!finished) {
      tile.slope.textContent = "…";
      tile["slope-note"].textContent = "Integrando as duas trajetórias.";
      tile.horizon.textContent = "…";
      tile["horizon-note"].textContent = "";
    } else {
      tile.slope.textContent = `${fmt(run.slope, 3)} 1/s`;
      const span = `entre t = ${trimmed(run.first.t[run.from], 0)} s e ${trimmed(run.first.t[run.to], 0)} s`;
      const what = run.pairs > 1 ? `Reta ajustada à média de ln d de ${run.pairs} duplas` : "Reta ajustada a ln d";
      tile["slope-note"].textContent = run.grows
        ? `${what}, ${span}. A distância dobra a cada ${fmt(Math.LN2 / run.slope, 1)} s.`
        : run.slope < 0
          ? `${what}, ${span}. A distância cai pela metade a cada ${fmt(-Math.LN2 / run.slope, 1)} s: não há sensibilidade.`
          : `${what}, ${span}. A distância não chega a crescer de forma sustentada.`;
      tile.horizon.textContent = run.horizon !== null ? `${trimmed(run.first.t[run.horizon], 0)} s` : "nunca";
      tile["horizon-note"].textContent = run.horizon !== null ? "Depois disso, prever um bloco pelo outro deixa de fazer sentido." : "Os dois blocos acabam no mesmo movimento: a previsão vale para sempre.";
    }
    const numbers = report.numbers;
    const key = run.caseKey;
    if (key && key in numbers.lyapunov) {
      tile.report.textContent = `${fmt(numbers.lyapunov[key], 3)} 1/s`;
      tile["report-note"].textContent =
        key === "A"
          ? `Negativo: em regime, vizinhas convergem. Antes dele o transiente é caótico, com taxa ${fmt(numbers.transient_lyapunov_A, 3)} 1/s.`
          : key === "C"
            ? "Pela equação variacional, em 32 trajetórias longas. A medida ao lado é uma amostra menor, direto das distâncias."
            : "Negativo: as trajetórias vizinhas convergem.";
    } else {
      tile.report.textContent = "–";
      tile["report-note"].textContent = "O relatório não tem medida para estes dados.";
    }
  }

  function draw() {
    if (!run) return;
    const colors = theme();
    const color = run.caseKey ? colors.cases[run.caseKey] : colors.free;
    const second = run.caseKey ? colors.ink : colors.ink3;
    const { first } = run;
    const n = first.t.length;
    const shown = Math.max(2, Math.floor(progress * (n - 1)) + 1);
    const stride = Math.max(1, Math.floor(n / 2400));

    xPlot.setView(0, run.tmax, -run.half, run.half);
    let ctx = xPlot.begin();
    xPlot.zeroLines();
    xPlot.clip(() => {
      for (const [series, stroke, width] of [[run.second.x, second, 1.4], [first.x, color, 2]]) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = width;
        ctx.lineJoin = "round";
        ctx.beginPath();
        for (let i = 0; i < shown; i += stride) {
          if (i === 0) ctx.moveTo(xPlot.px(first.t[i]), xPlot.py(series[i]));
          else ctx.lineTo(xPlot.px(first.t[i]), xPlot.py(series[i]));
        }
        ctx.stroke();
      }
      crosshair(ctx, xPlot);
    });
    legend(ctx, xPlot, [[color, "bloco 1"], [second, `bloco 2, partindo ${fmtSci(run.eps, 0)} m ao lado`]]);

    const lowest = Math.max(-16, Math.min(Math.floor(Math.log10(run.eps)) - 1, Math.floor(Math.min(...run.logDistance, ...run.meanLog))));
    dPlot.setView(0, run.tmax, lowest, 1.6);
    ctx = dPlot.begin();
    dPlot.clip(() => {
      ctx.strokeStyle = colors.axis;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(dPlot.px(0), dPlot.py(Math.log10(SEPARATED)));
      ctx.lineTo(dPlot.px(run.tmax), dPlot.py(Math.log10(SEPARATED)));
      ctx.stroke();
      ctx.setLineDash([]);

      const series = run.pairs > 1 ? [[run.logDistance, color, 1.4], [run.meanLog, colors.ink, 2.2]] : [[run.logDistance, color, 2]];
      for (const [values, stroke, width] of series) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = width;
        ctx.lineJoin = "round";
        ctx.beginPath();
        for (let i = 0; i < shown; i += stride) {
          if (i === 0) ctx.moveTo(dPlot.px(first.t[i]), dPlot.py(values[i]));
          else ctx.lineTo(dPlot.px(first.t[i]), dPlot.py(values[i]));
        }
        ctx.stroke();
      }

      if (progress >= 1) {
        const line = (t) => dPlot.py((run.intercept + run.slope * t) / Math.LN10);
        const [t0, t1] = [first.t[run.from], first.t[run.to]];
        for (const [stroke, width, dash] of [[colors.surface, 5, []], [colors.ink2, 1.6, [6, 4]]]) {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = width;
          ctx.setLineDash(dash);
          ctx.beginPath();
          ctx.moveTo(dPlot.px(t0), line(t0));
          ctx.lineTo(dPlot.px(t1), line(t1));
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      crosshair(ctx, dPlot);
    });
    ctx.font = `14px ${colors.mono}`;
    ctx.fillStyle = colors.ink3;
    ctx.font = `15px ${colors.sans}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("0,1 m: blocos separados", dPlot.inner.left + 8, dPlot.py(Math.log10(SEPARATED)) - 5);
    if (progress >= 1) legend(ctx, dPlot, run.pairs > 1 ? [[color, "esta dupla"], [colors.ink, `média de ${run.pairs} duplas`], [colors.ink2, "reta ajustada", true]] : [[color, "distância"], [colors.ink2, "reta ajustada", true]]);
  }

  function crosshair(ctx, plot) {
    if (hoverT === null) return;
    ctx.strokeStyle = theme().axis;
    ctx.lineWidth = 1;
    const x = Math.round(plot.px(hoverT)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, plot.inner.top);
    ctx.lineTo(x, plot.inner.top + plot.inner.height);
    ctx.stroke();
  }

  function legend(ctx, plot, items) {
    const colors = theme();
    ctx.font = `15px ${colors.sans}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let x = plot.inner.left + 6 + ctx.measureText(plot.yLabel).width + 24;
    const y = plot.inner.top + 13;
    for (const [stroke, label, dashed] of items) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.setLineDash(dashed ? [5, 3] : []);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 18, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = colors.ink2;
      ctx.fillText(label, x + 24, y);
      x += 24 + ctx.measureText(label).width + 20;
    }
  }

  function onMove(event, plot, canvas) {
    if (!run) return;
    const [px, py] = pointerPosition(event, canvas);
    if (!plot.contains(px, py)) return onLeave();
    hoverT = Math.max(0, Math.min(run.tmax, plot.invX(px)));
    const i = Math.min(run.first.t.length - 1, Math.round(hoverT / run.first.h));
    const [left, top] = offsetWithin(host, canvas);
    tooltip.show(
      left + px,
      top + py,
      `t = <b>${fmt(run.first.t[i], 1)} s</b><br>bloco 1: <b>${fmt(run.first.x[i], 4)} m</b><br>bloco 2: <b>${fmt(run.second.x[i], 4)} m</b><br>dist\u00e2ncia: <b>${fmtSci(10 ** run.logDistance[i], 1)} m</b>`,
    );
    if (progress >= 1) draw();
  }

  function onLeave() {
    hoverT = null;
    tooltip.hide();
    if (progress >= 1) draw();
  }

  for (const [plot, canvas] of [[xPlot, xCanvas], [dPlot, dCanvas]]) {
    canvas.addEventListener("pointermove", (event) => onMove(event, plot, canvas));
    canvas.addEventListener("pointerleave", onLeave);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible || !run || progress >= 1) return;
    progress = Math.min(1, (now - started) / (REVEAL_SECONDS * 1000));
    if (progress >= 1) writeTiles(true);
    draw();
  }

  runButton.addEventListener("click", start);
  epsSelect.addEventListener("change", start);
  watchVisibility(root, (value) => {
    visible = value;
    if (value && pendingAuto) {
      pendingAuto = false;
      start();
    }
  });
  onResize(xCanvas, draw);
  onResize(dCanvas, draw);
  onThemeChange(draw);
  requestAnimationFrame(frame);
}
