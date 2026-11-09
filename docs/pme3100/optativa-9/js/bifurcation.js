// Bifurcation diagram (precomputed in Python) with the largest Lyapunov exponent underneath.

import { Plot, createTooltip, fmt, hexToRgb, offsetWithin, onResize, onThemeChange, pointerPosition, theme, trimmed } from "./ui.js";

const BASE = { m: 1, k1: -1, k2: 1, c: 0.3, omega: 1.2 };

export async function createBifurcation(report, lab) {
  const root = document.getElementById("bifurcacao");
  const host = root.querySelector("[data-bif-host]");
  const mapCanvas = root.querySelector("#bif-map");
  const lyapCanvas = root.querySelector("#bif-lyap");
  const tooltip = createTooltip(host);
  const margin = { left: 52, right: 16 };
  const mapPlot = new Plot(mapCanvas, { yLabel: "x a cada período [m]", margin: { ...margin, top: 30, bottom: 8 }, xTickFormat: () => "", xTicks: 9 });
  const lyapPlot = new Plot(lyapCanvas, { xLabel: "amplitude da força A [N]", yLabel: "λ₁ [1/s], com a área sombreada onde há caos (λ₁ > 0)", margin: { ...margin, top: 8, bottom: 36 }, yTicks: 3, xTicks: 9 });
  const buffer = document.createElement("canvas");

  const load = async (name) => new Uint16Array(await (await fetch(`data/${name}`)).arrayBuffer());
  const [full, zoom] = await Promise.all([load("bifurcation.bin"), load("bifurcation_zoom.bin")]);
  const views = {
    full: { ...report.bifurcation, values: full, yRange: [-1.6, 1.6] },
    zoom: { ...report.bifurcation_zoom, values: zoom, yRange: [-1.6, 1.6] },
  };
  let view = views.full;
  let hover = null;
  let stale = true;

  const gammaAt = (index) => view.gamma[0] + (index / (view.count - 1)) * (view.gamma[1] - view.gamma[0]);
  const indexAt = (gamma) => Math.max(0, Math.min(view.count - 1, Math.round(((gamma - view.gamma[0]) / (view.gamma[1] - view.gamma[0])) * (view.count - 1))));

  function renderDensity() {
    const colors = theme();
    const { width, height } = mapPlot.inner;
    const scale = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    buffer.width = w;
    buffer.height = h;
    const counts = new Uint16Array(w * h);
    const [xLo, xHi] = report.x_range;
    const [yLo, yHi] = view.yRange;
    const column = w / view.count;
    const span = Math.max(1, Math.ceil(column));
    for (let i = 0; i < view.count; i++) {
      const px = Math.min(w - span, Math.floor(i * column));
      for (let j = 0; j < view.per_gamma; j++) {
        const x = xLo + (view.values[i * view.per_gamma + j] / 65535) * (xHi - xLo);
        const py = Math.floor(((yHi - x) / (yHi - yLo)) * h);
        if (py < 0 || py >= h) continue;
        for (let s = 0; s < span; s++) counts[py * w + px + s]++;
      }
    }
    const image = new ImageData(w, h);
    const pixels = new Uint32Array(image.data.buffer);
    const [r, g, b] = hexToRgb(colors.ink);
    const probe = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
    for (let i = 0; i < pixels.length; i++) {
      const n = counts[i];
      if (n === 0) continue;
      const alpha = Math.min(255, Math.round(255 * (1 - Math.exp(-n * 0.16 * scale))));
      pixels[i] = probe ? (alpha << 24) | (b << 16) | (g << 8) | r : (r << 24) | (g << 16) | (b << 8) | alpha;
    }
    buffer.getContext("2d").putImageData(image, 0, 0);
    stale = false;
  }

  function markers() {
    const colors = theme();
    const list = [
      { gamma: report.cases.E.A, label: "caso E", color: colors.cases.E },
      { gamma: report.cases.A.A, label: "caso A", color: colors.cases.A },
      { gamma: report.cases.C.A, label: "caso C", color: colors.cases.C },
      { gamma: report.numbers.melnikov, label: "limiar de Melnikov", color: null },
    ];
    return list.filter((item) => item.gamma >= view.gamma[0] && item.gamma <= view.gamma[1]);
  }

  function drawGuides(plot, withLabels) {
    const colors = theme();
    const ctx = plot.ctx;
    const { top, height } = plot.inner;
    if (view === views.zoom) {
      const [lo, hi] = report.numbers.window_p5;
      ctx.fillStyle = colors.dark ? "rgba(255,255,255,0.05)" : "rgba(20,22,26,0.05)";
      ctx.fillRect(plot.px(lo), top, plot.px(hi) - plot.px(lo), height);
      if (withLabels) {
        ctx.font = `15px ${colors.sans}`;
        ctx.fillStyle = colors.ink2;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(`órbita de período 5 estável: ${fmt(lo, 4)} a ${fmt(hi, 4)} N`, plot.px((lo + hi) / 2), top - 8);
      }
    }
    for (const item of markers()) {
      const x = Math.round(plot.px(item.gamma)) + 0.5;
      ctx.strokeStyle = item.color ?? colors.axis;
      ctx.lineWidth = item.color ? 1.5 : 1;
      ctx.setLineDash(item.color ? [] : [4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + height);
      ctx.stroke();
      ctx.setLineDash([]);
      if (withLabels && view === views.full) {
        ctx.font = `15px ${colors.sans}`;
        ctx.textBaseline = "bottom";
        ctx.textAlign = "left";
        if (item.color) {
          ctx.fillStyle = item.color;
          ctx.fillRect(x - 0.5, top - 20, 9, 9);
        }
        ctx.fillStyle = colors.ink2;
        ctx.fillText(item.label, x + (item.color ? 13 : 0), top - 9);
      }
    }
    if (hover !== null) {
      const x = Math.round(plot.px(gammaAt(hover))) + 0.5;
      ctx.strokeStyle = colors.ink;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + height);
      ctx.stroke();
    }
  }

  function draw() {
    const colors = theme();
    mapPlot.setView(view.gamma[0], view.gamma[1], ...view.yRange);
    let ctx = mapPlot.begin();
    const box = mapPlot.inner;
    const scale = Math.min(2, window.devicePixelRatio || 1);
    if (stale || buffer.width !== Math.round(box.width * scale) || buffer.height !== Math.round(box.height * scale)) renderDensity();
    ctx.drawImage(buffer, box.left, box.top, box.width, box.height);
    drawGuides(mapPlot, true);

    const values = view.lyapunov;
    const lo = Math.min(...values) - 0.02;
    const hi = Math.max(...values) + 0.03;
    lyapPlot.setView(view.gamma[0], view.gamma[1], lo, hi);
    ctx = lyapPlot.begin();
    lyapPlot.clip(() => {
      const zero = lyapPlot.py(0);
      ctx.fillStyle = colors.dark ? "rgba(236,235,231,0.16)" : "rgba(20,22,26,0.12)";
      ctx.beginPath();
      ctx.moveTo(lyapPlot.px(view.gamma[0]), zero);
      for (let i = 0; i < view.count; i++) ctx.lineTo(lyapPlot.px(gammaAt(i)), Math.min(zero, lyapPlot.py(values[i])));
      ctx.lineTo(lyapPlot.px(view.gamma[1]), zero);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = colors.axis;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lyapPlot.inner.left, Math.round(zero) + 0.5);
      ctx.lineTo(lyapPlot.inner.left + lyapPlot.inner.width, Math.round(zero) + 0.5);
      ctx.stroke();
      ctx.strokeStyle = colors.ink;
      ctx.lineWidth = 1.6;
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (let i = 0; i < view.count; i++) {
        if (i === 0) ctx.moveTo(lyapPlot.px(gammaAt(i)), lyapPlot.py(values[i]));
        else ctx.lineTo(lyapPlot.px(gammaAt(i)), lyapPlot.py(values[i]));
      }
      ctx.stroke();
    });
    drawGuides(lyapPlot, false);
  }

  function onMove(event, canvas, plot) {
    const [px, py] = pointerPosition(event, canvas);
    if (px < plot.inner.left || px > plot.inner.left + plot.inner.width) return onLeave();
    hover = indexAt(plot.invX(px));
    const lambda = view.lyapunov[hover];
    const kind = lambda > 0.005 ? "caos" : "periódico";
    const [left, top] = offsetWithin(host, canvas);
    tooltip.show(left + px, top + py, `A = <b>${fmt(gammaAt(hover), 4)} N</b><br>λ₁ = <b>${fmt(lambda, 3)} 1/s</b> (${kind})<br>clique para abrir no laboratório`);
    draw();
  }

  function onLeave() {
    hover = null;
    tooltip.hide();
    draw();
  }

  function onClick(event, canvas, plot) {
    const [px] = pointerPosition(event, canvas);
    if (px < plot.inner.left || px > plot.inner.left + plot.inner.width) return;
    const gamma = Number(gammaAt(indexAt(plot.invX(px))).toFixed(4));
    lab.load({ params: { ...BASE, A: gamma }, x0: 1, v0: 0, tmax: 314.2, scroll: true });
  }

  for (const [canvas, plot] of [[mapCanvas, mapPlot], [lyapCanvas, lyapPlot]]) {
    canvas.addEventListener("pointermove", (event) => onMove(event, canvas, plot));
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("click", (event) => onClick(event, canvas, plot));
  }

  for (const button of root.querySelectorAll("[data-bif-view] button")) {
    button.addEventListener("click", () => {
      view = views[button.dataset.view];
      for (const other of root.querySelectorAll("[data-bif-view] button")) other.setAttribute("aria-pressed", String(other === button));
      stale = true;
      hover = null;
      draw();
    });
  }

  onResize(mapCanvas, draw);
  onThemeChange(() => {
    stale = true;
    draw();
  });
  document.fonts?.ready.then(draw);
  draw();
}
