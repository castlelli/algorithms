// What the Coriolis term does: the same start integrated with and without it, seen from the
// ground and from the carousel, and the magnitude of every acceleration term over time.

import { integrateGroundFrame, norm, state } from "./model.js";
import { drawScene, prepare } from "./scene.js";
import { crisp, fmt, reducedMotion, segmented, theme, whenVisible } from "./ui.js";
import { caseButtons } from "./lab.js";
import { onLangChange, t as tr } from "./i18n.js";

const SERIES = [
  ["a_rel", "a_rel"],
  ["a_arr_t", "α∧OF"],
  ["a_arr_n", "ω∧(ω∧OF)"],
  ["a_cor", "a_cor"],
  ["a_abs", "a_abs"],
];
const SAMPLES = 400;

export function createCoriolis(report, lab, motions) {
  const root = document.getElementById("coriolis");
  const tiles = Object.fromEntries([...root.querySelectorAll("[data-cor]")].map((el) => [el.dataset.cor, el]));
  const playButton = root.querySelector("[data-cor-play]");
  let source = "3";
  let motion = null;
  let prep = null;
  let ghost = null;
  let series = null;
  let t = 0;
  let hover = null;
  let stats = null;
  let raf = 0;

  const scene = (frame) => (ctx, w, h) => {
    if (!prep) return;
    drawScene(ctx, w, h, prep, t, { frame, ghost, vectors: ["a_cor"], labels: w > 280, half: 1.55 * motion.R, axisLabels: false });
  };
  const ground = crisp(root.querySelector("#cor-ground"), scene("ground"));
  const carousel = crisp(root.querySelector("#cor-carousel"), scene("carousel"));
  const chart = crisp(root.querySelector("#cor-chart"), drawChart);

  function drawChart(ctx, w, h) {
    if (!series) return;
    const th = theme();
    const pad = { l: 54, r: 16, t: 14, b: 34 };
    const max = Math.max(1e-12, ...SERIES.map(([name]) => Math.max(...series[name])));
    const yMax = niceCeil(max * 1.05);
    const X = (tt) => pad.l + (tt / motion.tf) * (w - pad.l - pad.r);
    const Y = (v) => h - pad.b - (v / yMax) * (h - pad.t - pad.b);
    ctx.font = `500 10.5px ${th.mono}`;
    ctx.fillStyle = th.ink3;
    ctx.strokeStyle = th.grid;
    ctx.lineWidth = 1;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) {
      const v = (yMax * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.l, Y(v));
      ctx.lineTo(w - pad.r, Y(v));
      ctx.stroke();
      ctx.fillText(fmt(v, digitsFor(yMax / 4)), pad.l - 8, Y(v));
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const tStep = niceCeil(motion.tf / 6);
    for (let tt = 0; tt <= motion.tf + 1e-9; tt += tStep) {
      ctx.fillText(fmt(tt, digitsFor(tStep)), X(tt), h - pad.b + 8);
    }
    ctx.textAlign = "right";
    ctx.fillText("t [s]", w - pad.r, h - 14);
    ctx.save();
    ctx.translate(14, pad.t + 4);
    ctx.textAlign = "left";
    ctx.fillText("m/s²", 0, 0);
    ctx.restore();

    for (const [name] of SERIES) {
      ctx.strokeStyle = th.vec[name];
      ctx.lineWidth = name === "a_abs" ? 2.6 : name === "a_cor" ? 2.4 : 1.8;
      ctx.beginPath();
      series[name].forEach((v, i) => {
        const px = X(series.t[i]);
        const py = Y(v);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }

    // Cursor: animation time, or the pointer when hovering.
    const tc = hover ?? t;
    const xc = X(tc);
    ctx.strokeStyle = th.ink3;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(xc, pad.t);
    ctx.lineTo(xc, h - pad.b);
    ctx.stroke();
    ctx.setLineDash([]);
    const e = state(motion, tc);
    const rows = SERIES.map(([name, label]) => [name, label, norm(e.vec[name])]);
    const boxW = 168;
    const boxH = 18 * rows.length + 26;
    const bx = xc + 12 + boxW > w - pad.r ? xc - 12 - boxW : xc + 12;
    const by = pad.t + 4;
    ctx.fillStyle = th.surface;
    ctx.strokeStyle = th.line;
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = th.ink;
    ctx.font = `600 11px ${th.mono}`;
    ctx.fillText(`t = ${fmt(tc, 2)} s`, bx + 10, by + 13);
    ctx.font = `500 11px ${th.mono}`;
    rows.forEach(([name, label, value], i) => {
      const y = by + 32 + i * 18;
      ctx.fillStyle = th.vec[name];
      ctx.fillRect(bx + 10, y - 1, 12, 2.5);
      ctx.fillStyle = th.ink2;
      ctx.fillText(label, bx + 28, y);
      ctx.textAlign = "right";
      ctx.fillText(fmt(value, 3), bx + boxW - 10, y);
      ctx.textAlign = "left";
    });
  }

  const chartCanvas = root.querySelector("#cor-chart");
  const pointer = (event) => {
    if (!motion) return;
    const rect = chartCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    hover = Math.max(0, Math.min(motion.tf, ((x - 54) / (rect.width - 54 - 16)) * motion.tf));
    chart.redraw();
  };
  chartCanvas.addEventListener("pointermove", pointer);
  chartCanvas.addEventListener("pointerdown", pointer);
  chartCanvas.addEventListener("pointerleave", () => {
    hover = null;
    chart.redraw();
  });

  function redrawAll() {
    ground.redraw();
    carousel.redraw();
    chart.redraw();
  }

  function setSource(key) {
    source = key;
    motion = key === "lab" ? lab.current().motion : motions[key];
    prep = prepare(motion);
    ghost = integrateGroundFrame(motion, false);
    series = { t: [] };
    for (const [name] of SERIES) series[name] = [];
    let maxCor = 0;
    let maxAt = 0;
    let shareSum = 0;
    let shareN = 0;
    for (let i = 0; i <= SAMPLES; i++) {
      const tt = (motion.tf * i) / SAMPLES;
      const e = state(motion, tt);
      series.t.push(tt);
      for (const [name] of SERIES) series[name].push(norm(e.vec[name]));
      const cor = norm(e.vec.a_cor);
      if (cor > maxCor) {
        maxCor = cor;
        maxAt = tt;
      }
      const abs = norm(e.vec.a_abs);
      if (abs > 1e-9) {
        shareSum += cor / abs;
        shareN += 1;
      }
    }
    const n = ghost.steps;
    const end = state(motion, motion.tf).pos;
    const drift = Math.hypot(ghost.points[2 * n] - end[0], ghost.points[2 * n + 1] - end[1]);
    stats = { drift, maxCor, maxAt, share: shareN ? (100 * shareSum) / shareN : NaN };
    renderTiles();
    t = motion.tf;
    redrawAll();
  }

  function renderTiles() {
    tiles.drift.textContent = `${fmt(stats.drift, 2)} m`;
    tiles.max.textContent = `${fmt(stats.maxCor, 3)} m/s²`;
    tiles["max-note"].textContent = tr("cor.maxAt", { t: fmt(stats.maxAt, 2) });
    tiles.share.textContent = Number.isFinite(stats.share) ? `${fmt(stats.share, 0)} %` : "–";
  }

  function play() {
    cancelAnimationFrame(raf);
    if (reducedMotion()) {
      t = motion.tf;
      redrawAll();
      return;
    }
    t = 0;
    let previous = 0;
    const step = (now) => {
      const dt = previous ? Math.min(0.05, (now - previous) / 1000) : 0;
      previous = now;
      t = Math.min(motion.tf, t + dt);
      redrawAll();
      if (t < motion.tf) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  const caseRoot = root.querySelector("[data-cor-case]");
  caseButtons(caseRoot, report, source, true);
  onLangChange(() => {
    caseButtons(caseRoot, report, source, true);
    renderTiles();
  });
  segmented(caseRoot, (value) => {
    setSource(value);
    play();
  });
  lab.onChange(() => source === "lab" && setSource("lab"));
  playButton.addEventListener("click", play);

  setSource("3");
  let played = false;
  whenVisible(root.querySelector("#cor-ground"), (on) => {
    if (on && !played) {
      played = true;
      play();
    }
  });
}

function niceCeil(raw) {
  const exponent = Math.floor(Math.log10(raw));
  const base = raw / 10 ** exponent;
  const nice = base <= 1 ? 1 : base <= 2 ? 2 : base <= 2.5 ? 2.5 : base <= 5 ? 5 : 10;
  return nice * 10 ** exponent;
}
const digitsFor = (step) => Math.max(0, Math.min(3, -Math.floor(Math.log10(step) + 1e-9) + (step / 10 ** Math.floor(Math.log10(step)) === 2.5 ? 1 : 0)));
