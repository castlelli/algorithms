// 05 · Law of motion θ = ωt (item 1.7): v, a and a = a_t τ + a_n n, a chart over one period and
// the table at three instants in cartesian or intrinsic form.

import { instant, norm } from "./model.js";
import { curvePoints, drawCusps, drawRing, drawTrace } from "./scene.js";
import { onLangChange, t as tr } from "./i18n.js";
import { arrow, crisp, dot2, drag, fmt, fmtSig, fmtVec, label, loop, planeView, reducedMotion, segmented, slider, theme, toggle } from "./ui.js";

const SECONDS_PER_PERIOD = 16; // animation time for one period at real ω = π/60

export function createMotion(store, report) {
  const root = document.getElementById("lei");
  const omega = report.entradas.omega;
  const readout = root.querySelector("[data-motion-readout]");
  const caption = root.querySelector("[data-motion-caption]");
  const output = root.querySelector("[data-motion-out]");
  const playButton = root.querySelector("[data-motion-play]");
  const form = root.querySelector("[data-motion-form]");
  const head = root.querySelector("[data-motion-head]");
  const body = root.querySelector("[data-motion-table]");
  const tableCaption = root.querySelector("[data-motion-table-caption]");
  const show = { parts: true, instants: true };
  let h = store.h;
  let instants = [...report.entradas.instantes];
  let kind = "cart";
  let time = instants[0];
  let playing = !reducedMotion();
  let scales = null;

  const period = () => h.thetaMax / omega;

  /** Arrow length per unit of |v| and |a|: the largest of the period is 0.3R (as in the report). */
  const computeScales = () => {
    let vmax = 0;
    let amax = 0;
    for (let i = 0; i <= 2000; i++) {
      const th = (h.thetaMax * i) / 2000;
      vmax = Math.max(vmax, omega * norm(h.d1(th)));
      amax = Math.max(amax, omega * omega * norm(h.d2(th)));
    }
    scales = { v: (0.3 * h.R) / vmax, a: (0.3 * h.R) / amax, vmax, amax };
  };
  computeScales();

  const drawVectors = (ctx, v, e, t, faint = false) => {
    const [px, py] = v.pt(e.pos);
    const tip = (vec, s) => [px + vec[0] * s * v.s, py - vec[1] * s * v.s];
    const w = faint ? 1.5 : 2.4;
    const alpha = faint ? 0.55 : 1;
    if (!e.atCusp && show.parts && !faint) {
      const [ax, ay] = tip(e.tau, e.at * scales.a);
      const [nx, ny] = tip(e.n, e.an * scales.a);
      arrow(ctx, px, py, ax, ay, t.c.at, 1.8);
      arrow(ctx, px, py, nx, ny, t.c.an, 1.8);
      // The parallelogram that closes on a.
      const [qx, qy] = tip(e.a, scales.a);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = t.ink3;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(qx, qy);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      ctx.restore();
      label(ctx, "a", "t", ax + 6, ay, t.c.at, 13);
      label(ctx, "a", "n", nx + 6, ny, t.c.an, 13);
    }
    const [ax, ay] = tip(e.a, scales.a);
    const [vx, vy] = tip(e.v, scales.v);
    arrow(ctx, px, py, ax, ay, t.c.a, w, alpha);
    arrow(ctx, px, py, vx, vy, t.c.v, w, alpha);
    if (!faint) {
      label(ctx, "a", "", ax + 6, ay - 4, t.c.a, 14, true);
      label(ctx, "v", "", vx + 6, vy - 4, t.c.v, 14, true);
    }
    dot2(ctx, px, py, faint ? 3 : 4.6, faint ? t.ink3 : t.c.pen, t.surface, 1.4);
  };

  const scene = crisp(document.getElementById("motion-scene"), (ctx, w, hgt) => {
    const t = theme();
    const v = planeView(w, hgt, h.R * 1.18, 0, 0, 8);
    drawRing(ctx, v, h, { ticks: false });
    drawTrace(ctx, v, curvePoints(h), t.c.curve, 1.8);
    drawCusps(ctx, v, h);
    if (show.instants) {
      for (const ti of instants) {
        const e = instant(h, omega, ti);
        drawVectors(ctx, v, e, t, true);
        const [px, py] = v.pt(e.pos);
        ctx.fillStyle = t.ink3;
        ctx.font = `500 11px ${t.mono}`;
        ctx.fillText(`${fmt(ti, 0)} s`, px + 7, py + 14);
      }
    }
    drawVectors(ctx, v, instant(h, omega, time), t);
    caption.textContent = tr("motion.caption");
  });

  const pad = { l: 40, r: 10, t: 12, b: 24 };
  const chartCanvas = document.getElementById("motion-chart");
  const chart = crisp(chartCanvas, (ctx, w, hgt) => {
    const t = theme();
    const T = period();
    const series = { s: [], at: [], an: [] };
    const n = 500;
    for (let i = 0; i <= n; i++) {
      const e = instant(h, omega, (T * i) / n);
      const at = e.atCusp ? 0 : e.at;
      series.s.push(e.speed);
      series.at.push(at);
      series.an.push(e.an || 0);
    }
    // Speed and accelerations have different units: each on its own scale, sharing the zero line
    // in the middle (a_t changes sign, and jumps at the cusps, where τ flips).
    const sScale = Math.max(...series.s);
    const aScale = Math.max(...series.at.map(Math.abs), ...series.an);
    const x = (i) => pad.l + ((w - pad.l - pad.r) * i) / n;
    const zero = (pad.t + hgt - pad.b) / 2;
    const y = (val, s) => zero - (val / s) * (zero - pad.t);
    ctx.strokeStyle = t.grid2;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, zero + 0.5);
    ctx.lineTo(w - pad.r, zero + 0.5);
    ctx.stroke();
    for (const [key, color, s] of [["s", t.c.v, sScale], ["at", t.c.at, aScale], ["an", t.c.an, aScale]]) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      series[key].forEach((val, i) => {
        const jump = i > 0 && Math.abs(val - series[key][i - 1]) > 0.5 * s;
        if (i === 0 || jump) ctx.moveTo(x(i), y(val, s));
        else ctx.lineTo(x(i), y(val, s));
      });
      ctx.stroke();
      ctx.restore();
    }
    const xt = pad.l + ((w - pad.l - pad.r) * time) / T;
    ctx.strokeStyle = t.c.pen;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(xt, pad.t);
    ctx.lineTo(xt, hgt - pad.b);
    ctx.stroke();
    ctx.font = `500 10px ${t.mono}`;
    ctx.fillStyle = t.ink3;
    ctx.fillText("0", pad.l - 3, hgt - 8);
    ctx.fillText(`${fmt(T, 0)} s`, w - pad.r - 34, hgt - 8);
    ctx.fillText("t", (w + pad.l) / 2, hgt - 8);
    label(ctx, "ṡ", "", 6, pad.t + 6, t.c.v, 12);
    label(ctx, "a", "t", 6, pad.t + 22, t.c.at, 12);
    label(ctx, "a", "n", 6, pad.t + 38, t.c.an, 12);
  });

  const renderReadout = () => {
    const e = instant(h, omega, time);
    const rows = [
      ["θ = ωt", `${fmt(e.theta, 4)} rad`],
      ["v", `${fmtVec(e.v, 4)} m/s`],
      ["a", `${fmtVec(e.a, 4)} m/s²`],
      ["ṡ = |v|", `${fmtSig(e.speed, 4)} m/s`],
      ["a<sub>t</sub> · a<sub>n</sub>", e.atCusp ? tr("motion.cusp") : `${fmtSig(e.at, 4)} · ${fmtSig(e.an, 4)} m/s²`],
      ["ρ", fmtSig(e.rho, 4)],
    ];
    readout.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
    output.textContent = `${fmt(time, 1)} s`;
  };

  const renderTable = () => {
    tableCaption.innerHTML = tr(kind === "cart" ? "motion.tableCart" : "motion.tableIntr");
    if (kind === "cart") {
      head.innerHTML = "<tr><th scope=\"col\">t [s]</th><th scope=\"col\">θ [rad]</th><th scope=\"col\">x</th><th scope=\"col\">y</th><th scope=\"col\">v<sub>x</sub></th><th scope=\"col\">v<sub>y</sub></th><th scope=\"col\">a<sub>x</sub></th><th scope=\"col\">a<sub>y</sub></th></tr>";
    } else {
      head.innerHTML = "<tr><th scope=\"col\">t [s]</th><th scope=\"col\">ṡ [m/s]</th><th scope=\"col\">a<sub>t</sub> [m/s²]</th><th scope=\"col\">a<sub>n</sub> [m/s²]</th><th scope=\"col\">ρ</th><th scope=\"col\">τ</th><th scope=\"col\">n</th></tr>";
    }
    body.innerHTML = instants.map((ti) => {
      const e = instant(h, omega, ti);
      if (kind === "cart") {
        return `<tr><td>${fmt(ti, 1)}</td><td>${fmt(e.theta, 4)}</td><td>${fmt(e.pos[0], 4)}</td><td>${fmt(e.pos[1], 4)}</td>`
          + `<td>${fmtSig(e.v[0], 4)}</td><td>${fmtSig(e.v[1], 4)}</td><td>${fmtSig(e.a[0], 4)}</td><td>${fmtSig(e.a[1], 4)}</td></tr>`;
      }
      if (e.atCusp) return `<tr><td>${fmt(ti, 1)}</td><td>0</td><td colspan="5">${tr("motion.cusp")}</td></tr>`;
      return `<tr><td>${fmt(ti, 1)}</td><td>${fmtSig(e.speed, 4)}</td><td>${fmtSig(e.at, 4)}</td><td>${fmtSig(e.an, 4)}</td>`
        + `<td>${fmtSig(e.rho, 4)}</td><td>${fmtVec(e.tau, 3)}</td><td>${fmtVec(e.n, 3)}</td></tr>`;
    }).join("");
  };

  const redraw = () => {
    scene.redraw();
    chart.redraw();
    renderReadout();
  };

  const tSlider = slider(document.getElementById("motion-t"), (value) => {
    time = (value / 1000) * period();
    setPlaying(false);
    redraw();
  });
  const sync = () => tSlider.set(Math.round((time / period()) * 1000));
  drag(chartCanvas, (px) => {
    const w = chartCanvas.getBoundingClientRect().width;
    time = Math.max(0, Math.min(1, (px - pad.l) / (w - pad.l - pad.r))) * period();
    setPlaying(false);
    sync();
    redraw();
  });

  const label2 = () => (playButton.textContent = tr(playing ? "lab.pause" : "lab.play"));
  const setPlaying = (on) => {
    playing = on;
    label2();
    if (on) anim.kick();
  };
  playButton.addEventListener("click", () => setPlaying(!playing));
  const anim = loop(document.getElementById("motion-scene"), () => playing, (dt) => {
    time = (time + (period() / SECONDS_PER_PERIOD) * dt) % period();
    sync();
    redraw();
  });

  for (const button of root.querySelectorAll("[data-motion-toggle]")) {
    toggle(button, (on) => {
      show[button.dataset.motionToggle] = on;
      redraw();
    });
  }
  segmented(root.querySelector("[data-motion-form-kind]"), (value) => {
    kind = value;
    renderTable();
  });

  // Editable instants.
  const inputs = [...form.querySelectorAll("input")];
  const fill = () => inputs.forEach((input, i) => (input.value = fmt(instants[i], 0)));
  form.addEventListener("input", () => {
    const values = inputs.map((input) => Number(input.value.replace(",", ".")));
    inputs.forEach((input, i) => input.setAttribute("aria-invalid", String(!(Number.isFinite(values[i]) && values[i] >= 0 && input.value.trim() !== ""))));
    if (values.every((x, i) => Number.isFinite(x) && x >= 0 && inputs[i].value.trim() !== "")) {
      instants = values;
      renderTable();
      redraw();
    }
  });
  form.addEventListener("submit", (event) => event.preventDefault());

  store.subscribe((next) => {
    const frac = time / period();
    h = next;
    computeScales();
    time = frac * period();
    sync();
    renderTable();
    redraw();
  });
  onLangChange(() => {
    label2();
    fill();
    renderTable();
    renderReadout();
  });
  fill();
  label2();
  renderTable();
  sync();
  redraw();
}
