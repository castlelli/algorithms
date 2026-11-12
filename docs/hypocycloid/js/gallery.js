// 02 · Ratios (item 1.4): the report's four curves, and an explorer that draws any R/r turn by turn.

import { hypocycloid } from "./model.js";
import { curvePoints, drawCusps, drawRing, drawTrace } from "./scene.js";
import { onLangChange, t as tr, turns } from "./i18n.js";
import { crisp, fmt, fmtSig, loop, planeView, polyline, reducedMotion, slider, theme } from "./ui.js";

const MAX_TURNS = 60;
const TURNS_PER_SECOND = 0.45;

const fracText = (h) => (h.closes ? (h.q === 1 ? String(h.p) : `${h.p}/${h.q}`) : tr("ratios.irrational"));

export function createGallery(report) {
  const root = document.getElementById("razoes");
  const list = root.querySelector("[data-gallery]");

  // The report's ratios, r = 1.
  const cards = report.razoes.map((z) => {
    const h = hypocycloid(z.razao, 1);
    const li = document.createElement("li");
    li.className = "panel sheet";
    const canvas = document.createElement("canvas");
    const cap = document.createElement("p");
    li.append(canvas, cap);
    list.append(li);
    crisp(canvas, (ctx, w, hgt) => {
      const t = theme();
      const v = planeView(w, hgt, h.R * 1.12, 0, 0, 6);
      drawRing(ctx, v, h, { ticks: false });
      drawTrace(ctx, v, curvePoints(h), t.c.curve, 1.8);
      drawCusps(ctx, v, h);
    });
    const text = () => {
      cap.innerHTML = tr("ratios.galleryCaption", { k: fmt(z.razao, 1).replace(/[.,]0$/, ""), p: h.p, q: h.q, turns: turns(h.q) });
      canvas.setAttribute("aria-label", tr("ratios.galleryAria", { k: fmt(z.razao, 1) }));
    };
    text();
    return text;
  });

  // Explorer.
  const canvas = document.getElementById("ratio-scene");
  const output = root.querySelector("[data-ratio-out]");
  const facts = root.querySelector("[data-ratio-facts]");
  const caption = root.querySelector("[data-ratio-caption]");
  let h = hypocycloid(2.5, 1);
  let drawn = 0; // turns of the centre drawn so far
  let playing = false;

  const target = () => (h.closes ? Math.min(h.q, MAX_TURNS) : MAX_TURNS);

  const view = crisp(canvas, (ctx, w, hgt) => {
    const t = theme();
    const v = planeView(w, hgt, h.R * 1.1, 0, 0, 8);
    drawRing(ctx, v, h);
    const upTo = 2 * Math.PI * drawn;
    const perTurn = Math.round(48 * (h.R / h.r + 1));
    const n = Math.max(2, Math.ceil(perTurn * drawn));
    const pts = new Array(n + 1);
    for (let i = 0; i <= n; i++) pts[i] = v.pt(h.pos((upTo * i) / n));
    ctx.save();
    ctx.strokeStyle = t.c.curve;
    ctx.lineWidth = drawn > 8 ? 1 : 1.6;
    ctx.globalAlpha = drawn > 8 ? 0.8 : 1;
    ctx.lineJoin = "round";
    polyline(ctx, pts);
    ctx.stroke();
    ctx.restore();
    if (h.closes && drawn >= h.q) drawCusps(ctx, v, h);
    const shown = Math.floor(drawn + 1e-9);
    caption.textContent = tr("ratios.caption", { n: shown, turns: turns(shown) });
  });

  const renderFacts = () => {
    output.textContent = fmt(h.R, 3);
    const rows = [
      [tr("ratios.fraction"), fracText(h)],
      [tr("ratios.cusps"), h.closes ? String(h.p) : "∞"],
      [tr("ratios.closes"), h.closes ? `${h.q} ${turns(h.q)}` : tr("ratios.never")],
      [tr("ratios.length"), h.closes ? fmtSig(h.length, 4) : "∞"],
    ];
    facts.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  };

  const restart = () => {
    drawn = reducedMotion() ? target() : 0;
    playing = !reducedMotion();
    anim.kick();
    view.redraw();
  };
  const setRatio = (k) => {
    h = hypocycloid(k, 1);
    renderFacts();
    restart();
  };

  const kSlider = slider(document.getElementById("ratio-k"), (k) => setRatio(k));
  for (const b of root.querySelectorAll("[data-ratio-presets] button")) {
    b.addEventListener("click", () => {
      const k = Number(b.dataset.value);
      kSlider.set(k);
      setRatio(k);
    });
  }
  root.querySelector("[data-ratio-play]").addEventListener("click", restart);

  const anim = loop(canvas, () => playing, (dt) => {
    // Faster when many turns are needed, so 60 turns take about 15 s.
    const rate = TURNS_PER_SECOND * Math.max(1, target() / 7);
    drawn = Math.min(target(), drawn + rate * dt);
    if (drawn >= target()) playing = false;
    view.redraw();
  });

  onLangChange(() => {
    cards.forEach((text) => text());
    renderFacts();
    view.redraw();
  });
  renderFacts();
  restart();
}
