// Numerical checks done in the browser: RK4 convergence order and the report's measurements.

import { coefficients, detectPeriod, forcingPeriod, integrate, lyapunovRun, strobe } from "./model.js";
import { Plot, createTooltip, fmt, fmtSci, offsetWithin, onResize, onThemeChange, pointerPosition, superscript, theme, watchVisibility } from "./ui.js";

const TEST_TIME = 20;
const REFERENCE_STEP = 0.0005;

function createConvergence(report) {
  const root = document.getElementById("precisao");
  const host = root.querySelector("[data-conv-host]");
  const canvas = root.querySelector("#conv");
  const slider = root.querySelector("#conv-h");
  const label = root.querySelector("[data-conv-label]");
  const note = root.querySelector("[data-conv-note]");
  const tooltip = createTooltip(host);
  const power = (e) => `10${superscript(Math.round(e))}`;
  const plot = new Plot(canvas, { xLabel: "passo h [s]", yLabel: "erro [m]", margin: { left: 52, right: 16, top: 12, bottom: 34 }, xTickFormat: power, yTickFormat: power, xTicks: 3, yTicks: 6 });

  const item = report.cases.C;
  const [x0, v0] = item.initial[0];
  const reference = integrate(item, x0, v0, TEST_TIME, REFERENCE_STEP);
  const errorFor = (h) => {
    const run = integrate(item, x0, v0, TEST_TIME, h);
    const last = run.x.length - 1;
    return Math.hypot(run.x[last] - reference.x[reference.x.length - 1], run.v[last] - reference.v[reference.v.length - 1]);
  };
  const cached = report.numbers.convergence;
  const browser = cached.h.map((h) => ({ h, error: errorFor(h) }));
  let probe = null;

  function sliderStep() {
    return 10 ** (-0.7 - (Number(slider.value) / 100) * 1.9);
  }

  function update() {
    const h = TEST_TIME / Math.ceil(TEST_TIME / sliderStep());
    const error = errorFor(h);
    const order = Math.log2(error / errorFor(h / 2));
    probe = { h, error, order };
    label.textContent = `h = ${fmt(h, 4)} s`;
    slider.style.setProperty("--fill", `${slider.value}%`);
    const standard = forcingPeriod(item) / 200;
    note.textContent = `Com h = ${fmt(h, 4)} s o erro é ${fmtSci(error, 2)} m, e reduzir o passo à metade divide o erro por ${fmt(2 ** order, 1)} (ordem ${fmt(order, 2)}). O relatório usa h = T/200 = ${fmt(standard, 4)} s.`;
    draw();
  }

  function draw() {
    const colors = theme();
    plot.setView(-2.85, -0.55, -10.5, -1);
    const ctx = plot.begin();
    plot.clip(() => {
      const anchor = browser[3];
      ctx.strokeStyle = colors.axis;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      for (const logH of [-2.85, -0.55]) {
        const y = Math.log10(anchor.error) + 4 * (logH - Math.log10(anchor.h));
        if (logH === -2.85) ctx.moveTo(plot.px(logH), plot.py(y));
        else ctx.lineTo(plot.px(logH), plot.py(y));
      }
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = colors.cases.C;
      ctx.lineWidth = 2;
      ctx.beginPath();
      browser.forEach((point, i) => {
        if (i === 0) ctx.moveTo(plot.px(Math.log10(point.h)), plot.py(Math.log10(point.error)));
        else ctx.lineTo(plot.px(Math.log10(point.h)), plot.py(Math.log10(point.error)));
      });
      ctx.stroke();
      for (const point of browser) {
        ctx.fillStyle = colors.surface;
        ctx.beginPath();
        ctx.arc(plot.px(Math.log10(point.h)), plot.py(Math.log10(point.error)), 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = colors.cases.C;
        ctx.beginPath();
        ctx.arc(plot.px(Math.log10(point.h)), plot.py(Math.log10(point.error)), 4, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.strokeStyle = colors.ink;
      ctx.lineWidth = 1.5;
      cached.h.forEach((h, i) => {
        ctx.beginPath();
        ctx.arc(plot.px(Math.log10(h)), plot.py(Math.log10(cached.error[i])), 8, 0, 2 * Math.PI);
        ctx.stroke();
      });
      if (probe) {
        const px = plot.px(Math.log10(probe.h));
        const py = plot.py(Math.log10(probe.error));
        ctx.strokeStyle = colors.ink;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 0.5, plot.inner.top);
        ctx.lineTo(px + 0.5, plot.inner.top + plot.inner.height);
        ctx.stroke();
        ctx.fillStyle = colors.surface;
        ctx.beginPath();
        ctx.arc(px, py, 7, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = colors.ink;
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
    ctx.font = `15px ${colors.sans}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const x = plot.inner.left + 14;
    let y = plot.inner.top + 42;
    const entries = [
      ["dot", colors.cases.C, "calculado agora no navegador"],
      ["ring", colors.ink, "valor do relatório (Python)"],
      ["dash", colors.axis, "reta de inclinação 4"],
    ];
    for (const [kind, color, text] of entries) {
      ctx.strokeStyle = ctx.fillStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (kind === "dot") {
        ctx.arc(x + 8, y, 4, 0, 2 * Math.PI);
        ctx.fill();
      } else if (kind === "ring") {
        ctx.arc(x + 8, y, 6, 0, 2 * Math.PI);
        ctx.stroke();
      } else {
        ctx.setLineDash([5, 4]);
        ctx.moveTo(x, y);
        ctx.lineTo(x + 17, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = colors.ink2;
      ctx.fillText(text, x + 26, y);
      y += 23;
    }
  }

  canvas.addEventListener("pointermove", (event) => {
    const [px, py] = pointerPosition(event, canvas);
    let best = null;
    browser.forEach((point, i) => {
      const d = Math.hypot(plot.px(Math.log10(point.h)) - px, plot.py(Math.log10(point.error)) - py);
      if (d < 22 && (!best || d < best.d)) best = { d, point, i };
    });
    if (!best) return tooltip.hide();
    const [left, top] = offsetWithin(host, canvas);
    tooltip.show(left + px, top + py, `h = <b>${fmt(best.point.h, 4)} s</b><br>navegador: <b>${fmtSci(best.point.error, 3)} m</b><br>relatório: <b>${fmtSci(cached.error[best.i], 3)} m</b>`);
  });
  canvas.addEventListener("pointerleave", () => tooltip.hide());
  slider.addEventListener("input", update);
  onResize(canvas, draw);
  onThemeChange(draw);
  document.fonts?.ready.then(draw);
  update();
  return errorFor;
}

function createCheck(report, errorFor) {
  const root = document.getElementById("precisao");
  const body = root.querySelector("[data-check-rows]");
  const button = root.querySelector("[data-check-run]");
  const status = root.querySelector("[data-check-status]");
  const numbers = report.numbers;
  const cases = report.cases;
  let busy = false;
  let done = false;

  const settle = (key, periods) => {
    const item = cases[key];
    const section = strobe(coefficients(item), item.initial[0][0], item.initial[0][1], periods);
    return { section, x: section[section.length - 2], v: section[section.length - 1] };
  };
  function* lyapunov(key, periods) {
    const start = settle(key, 400);
    return (yield* lyapunovRun(coefficients(cases[key]), start.x, start.v, 0, periods)).lambda;
  }

  const rows = [
    {
      name: "Período do caso A, em períodos da força",
      expected: numbers.period_A,
      digits: 0,
      *compute() {
        return detectPeriod(settle("A", 700).section.slice(-400), 1e-5, 32);
      },
    },
    {
      name: "x final do caso A [m], após 12 mil passos",
      expected: numbers.endpoint_A[0],
      digits: 10,
      *compute() {
        const item = cases.A;
        const run = integrate(item, item.initial[0][0], item.initial[0][1], item.tmax);
        return run.x[run.x.length - 1];
      },
    },
    { name: "λ₁ do caso A [1/s]", expected: numbers.lyapunov.A, digits: 4, compute: () => lyapunov("A", 2000) },
    { name: "λ₁ do caso C [1/s], uma trajetória", expected: numbers.lyapunov.C, digits: 4, compute: () => lyapunov("C", 6000) },
    { name: "λ₁ do caso D [1/s]", expected: numbers.lyapunov.D, digits: 4, compute: () => lyapunov("D", 2000) },
    {
      name: "Amplitude do caso D [m]",
      expected: numbers.amplitude_D,
      digits: 6,
      *compute() {
        const item = cases.D;
        const run = integrate(item, 1, 0, 60 * forcingPeriod(item));
        let peak = 0;
        for (let i = run.x.length - 2001; i < run.x.length; i++) peak = Math.max(peak, Math.abs(run.x[i]));
        return peak;
      },
    },
    {
      name: "Ponto fixo do caso E, x [m]",
      expected: numbers.fixed_points_E[0][0],
      digits: 6,
      *compute() {
        return settle("E", 200).x;
      },
    },
    {
      name: "Erro do RK4 com h = 0,02 s [m]",
      expected: numbers.convergence.error[3],
      scientific: true,
      *compute() {
        return errorFor(0.02);
      },
    },
  ];

  const show = (row, value) => (row.scientific ? fmtSci(value, 3) : fmt(value, row.digits));
  body.innerHTML = rows.map((row, i) => `<tr><td>${row.name}</td><td>${show(row, row.expected)}</td><td class="pending" data-live="${i}">–</td><td class="pending" data-diff="${i}">–</td></tr>`).join("");

  async function run() {
    if (busy) return;
    busy = true;
    button.disabled = true;
    const started = performance.now();
    for (const [i, row] of rows.entries()) {
      const live = body.querySelector(`[data-live="${i}"]`);
      const diff = body.querySelector(`[data-diff="${i}"]`);
      live.textContent = diff.textContent = "…";
      status.textContent = `Calculando ${i + 1} de ${rows.length}`;
      await new Promise(requestAnimationFrame);
      const task = row.compute();
      let step = task.next();
      let slice = performance.now();
      while (!step.done) {
        if (performance.now() - slice > 30) {
          await new Promise(requestAnimationFrame);
          slice = performance.now();
        }
        step = task.next();
      }
      live.textContent = show(row, step.value);
      const delta = Math.abs(step.value - row.expected);
      diff.textContent = delta === 0 ? "0" : fmtSci(delta, 1);
      live.className = diff.className = "";
    }
    status.textContent = `Refeito em ${fmt((performance.now() - started) / 1000, 1)} s nesta máquina.`;
    button.disabled = false;
    busy = false;
    done = true;
  }

  button.addEventListener("click", run);
  watchVisibility(body, (visible) => {
    if (visible && !done && !busy) run();
  });
}

export function createPrecision(report) {
  createCheck(report, createConvergence(report));
}
