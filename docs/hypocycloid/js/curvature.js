// 03 · Curvature (item 1.5): drag a point, see its osculating circle, ρ(θ) and the evolute.

import { curvePoints, drawCusps, drawRing, drawTrace } from "./scene.js";
import { onLangChange, t as tr } from "./i18n.js";
import { arrow, crisp, dot2, drag, fmt, fmtSig, label, planeView, polyline, theme, toggle, withAlpha } from "./ui.js";

export function createCurvature(store, report) {
  const root = document.getElementById("curvatura");
  const readout = root.querySelector("[data-curv-readout]");
  const tableBody = root.querySelector("[data-curv-table]");
  const show = { evolute: false, points: true };
  let h = store.h;
  let theta = 0.62 * (2 * Math.PI * h.r) / h.R; // a little past the middle of the first arc
  let windowHalf = 0;

  const reportCurve = () => report.entradas.R === h.R && report.entradas.r === h.r;
  const points = () => (reportCurve() ? report.rho.map((z) => z.theta) : h.safePoints(6));

  const sceneCanvas = document.getElementById("curv-scene");
  let sceneView = null;
  const scene = crisp(sceneCanvas, (ctx, w, hgt) => {
    const t = theme();
    // Window: the ring, or the evolute if it reaches farther (R/|R − 2r| times the ring).
    windowHalf = h.R * (show.evolute && !h.degenerate ? Math.min(3, Math.max(1.1, h.R / Math.abs(h.R - 2 * h.r))) : 1.1);
    const v = planeView(w, hgt, windowHalf, 0, 0, 8);
    sceneView = v;
    drawRing(ctx, v, h, { ticks: false });
    if (show.evolute && !h.degenerate) {
      const n = 1600;
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const th = (h.thetaMax * i) / n;
        if (Math.abs(h.sinHalf(th)) < 1e-6) continue;
        pts.push(v.pt(h.curvatureCenter(th)));
      }
      ctx.save();
      ctx.strokeStyle = withAlpha(t.c.rho, 0.75);
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 3]);
      polyline(ctx, pts);
      ctx.stroke();
      ctx.restore();
    }
    drawTrace(ctx, v, curvePoints(h), t.c.curve, 2);
    drawCusps(ctx, v, h);
    if (show.points) {
      points().forEach((th, i) => {
        const [x, y] = v.pt(h.pos(th));
        dot2(ctx, x, y, 3.2, t.surface, t.c.rho, 1.4);
        ctx.fillStyle = t.ink3;
        ctx.font = `500 11px ${t.mono}`;
        ctx.fillText(String(i + 1), x + 6, y - 6);
      });
    }
    const P = h.pos(theta);
    const [px, py] = v.pt(P);
    const atCusp = Math.abs(h.sinHalf(theta)) < 1e-9;
    if (!atCusp && !h.degenerate) {
      const rho = h.rhoClosed(theta);
      const C = h.curvatureCenter(theta);
      const [cx, cy] = v.pt(C);
      ctx.save();
      ctx.fillStyle = withAlpha(t.c.rho, t.dark ? 0.1 : 0.07);
      ctx.strokeStyle = t.c.rho;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(cx, cy, rho * v.s, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(cx, cy);
      ctx.stroke();
      ctx.restore();
      dot2(ctx, cx, cy, 3, t.c.rho);
      label(ctx, "ρ", "", (px + cx) / 2 + 6, (py + cy) / 2, t.c.rho, 14);
      const { tau, n } = h.frame(theta);
      const L = 0.16 * h.R * v.s;
      arrow(ctx, px, py, px + L * tau[0], py - L * tau[1], t.c.tau, 2.2);
      arrow(ctx, px, py, px + L * n[0], py - L * n[1], t.c.n, 2.2);
      label(ctx, "τ", "", px + (L + 9) * tau[0] - 4, py - (L + 9) * tau[1], t.c.tau, 14, true);
      label(ctx, "n", "", px + (L + 9) * n[0] - 4, py - (L + 9) * n[1], t.c.n, 14, true);
    }
    dot2(ctx, px, py, 8, withAlpha(t.c.pen, 0.2));
    dot2(ctx, px, py, 4.6, t.c.pen, t.surface, 1.5);
  });

  const chartCanvas = document.getElementById("curv-chart");
  const pad = { l: 34, r: 10, t: 12, b: 24 };
  const chart = crisp(chartCanvas, (ctx, w, hgt) => {
    const t = theme();
    const x = (th) => pad.l + ((w - pad.l - pad.r) * th) / h.thetaMax;
    const top = h.degenerate ? 1 : h.rhoMax * 1.12;
    const y = (r) => hgt - pad.b - ((hgt - pad.t - pad.b) * r) / top;
    ctx.font = `500 10px ${t.mono}`;
    ctx.fillStyle = t.ink3;
    ctx.strokeStyle = t.grid2;
    ctx.lineWidth = 1;
    for (const c of h.cusps()) {
      ctx.beginPath();
      ctx.moveTo(x(c), pad.t);
      ctx.lineTo(x(c), hgt - pad.b);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(pad.l, hgt - pad.b + 0.5);
    ctx.lineTo(w - pad.r, hgt - pad.b + 0.5);
    ctx.stroke();
    if (!h.degenerate) {
      for (const r of [0, h.rhoMax]) ctx.fillText(fmt(r, 2), 2, y(r) + 3);
      const pts = [];
      for (let i = 0; i <= 600; i++) {
        const th = (h.thetaMax * i) / 600;
        pts.push([x(th), y(h.rhoClosed(th))]);
      }
      ctx.save();
      ctx.strokeStyle = t.c.rho;
      ctx.lineWidth = 1.8;
      polyline(ctx, pts);
      ctx.stroke();
      ctx.restore();
      if (show.points) for (const th of points()) dot2(ctx, x(th), y(h.rhoClosed(th)), 3, t.surface, t.c.rho, 1.4);
      dot2(ctx, x(theta), y(h.rhoClosed(theta)), 4.5, t.c.pen, t.surface, 1.5);
    }
    ctx.fillStyle = t.ink3;
    ctx.fillText("0", x(0) - 3, hgt - 8);
    ctx.fillText(`${h.q === 1 ? "" : h.q}2π`, x(h.thetaMax) - 22, hgt - 8);
    ctx.fillText("θ", (w + pad.l) / 2, hgt - 8);
  });

  const renderReadout = () => {
    const atCusp = Math.abs(h.sinHalf(theta)) < 1e-9;
    const rows = [
      ["θ", `${fmt(theta, 4)} rad`],
      ["P", `(${fmt(h.pos(theta)[0], 3)}; ${fmt(h.pos(theta)[1], 3)})`],
      [tr("curv.rhoClosed"), fmtSig(h.rhoClosed(theta), 6)],
      [tr("curv.rhoGeneral"), atCusp ? "0/0" : fmtSig(h.rho(theta), 6)],
      [tr("curv.kappa"), h.degenerate ? "0" : fmtSig(1 / h.rhoClosed(theta), 4)],
    ];
    readout.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")
      + (atCusp ? `<p class="note">${tr("curv.cusp")}</p>` : "");
  };

  const renderTable = () => {
    tableBody.innerHTML = points().map((th, i) => {
      const P = h.pos(th);
      return `<tr><td>${i + 1}</td><td>${fmt(th, 4)}</td><td>${fmt(P[0], 4)}</td><td>${fmt(P[1], 4)}</td><td>${fmtSig(h.rhoClosed(th), 5)}</td></tr>`;
    }).join("");
  };

  const redraw = () => {
    scene.redraw();
    chart.redraw();
    renderReadout();
  };

  // Drag on the scene: the nearest point of the curve.
  drag(sceneCanvas, (px, py) => {
    if (!sceneView) return;
    const [mx, my] = sceneView.inv(px, py);
    const pts = curvePoints(h);
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = (pts[i][0] - mx) ** 2 + (pts[i][1] - my) ** 2;
      if (d < bestD) [best, bestD] = [i, d];
    }
    theta = (h.thetaMax * best) / (pts.length - 1);
    redraw();
  });
  drag(chartCanvas, (px) => {
    const w = chartCanvas.getBoundingClientRect().width;
    theta = Math.max(0, Math.min(h.thetaMax, ((px - pad.l) / (w - pad.l - pad.r)) * h.thetaMax));
    redraw();
  });
  // Keyboard: arrows move the point along the curve.
  sceneCanvas.tabIndex = 0;
  sceneCanvas.addEventListener("keydown", (event) => {
    const step = (event.shiftKey ? 0.1 : 0.01) * h.thetaMax / h.q;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") theta = Math.min(h.thetaMax, theta + step);
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") theta = Math.max(0, theta - step);
    else return;
    event.preventDefault();
    redraw();
  });

  for (const button of root.querySelectorAll("[data-curv-toggle]")) {
    toggle(button, (on) => {
      show[button.dataset.curvToggle] = on;
      redraw();
    });
  }

  store.subscribe((next) => {
    const frac = theta / h.thetaMax;
    h = next;
    theta = frac * h.thetaMax;
    renderTable();
    redraw();
  });
  onLangChange(renderReadout);
  renderTable();
  redraw();
}
