// 04 · Tangent and normal (item 1.6): τ and n at N points, or the curvature comb ρn.

import { curvePoints, drawCusps, drawRing, drawTrace } from "./scene.js";
import { onLangChange, t as tr } from "./i18n.js";
import { arrow, crisp, dot2, loop, planeView, polyline, reducedMotion, segmented, slider, theme, withAlpha } from "./ui.js";

export function createFrame(store) {
  const root = document.getElementById("versores");
  const canvas = document.getElementById("frame-scene");
  const caption = root.querySelector("[data-frame-caption]");
  const output = root.querySelector("[data-frame-out]");
  const playButton = root.querySelector("[data-frame-play]");
  let h = store.h;
  let count = 8;
  let mode = "unit";
  let phase = 0; // fraction of the period added to every point while sliding
  let playing = false;

  const view = crisp(canvas, (ctx, w, hgt) => {
    const t = theme();
    const comb = mode === "comb" && !h.degenerate;
    const reach = comb ? Math.min(3, Math.max(1.1, h.R / Math.abs(h.R - 2 * h.r))) : 1.12;
    const v = planeView(w, hgt, h.R * reach, 0, 0, 10);
    drawRing(ctx, v, h, { ticks: false });
    drawTrace(ctx, v, curvePoints(h), t.c.curve, 2);
    drawCusps(ctx, v, h);
    const thetas = h.safePoints(count).map((th) => (th + phase * h.thetaMax) % h.thetaMax)
      .filter((th) => Math.abs(h.sinHalf(th)) > 0.02);
    if (comb) {
      // Many teeth: ρn from each point, and the tips joined (they lie on the evolute).
      const dense = [];
      const m = Math.max(120, count * 6);
      for (let i = 0; i <= m; i++) {
        const th = (h.thetaMax * (i + phase * m)) / m;
        if (Math.abs(h.sinHalf(th)) < 1e-6) continue;
        dense.push(th % h.thetaMax);
      }
      ctx.save();
      ctx.strokeStyle = withAlpha(t.c.rho, 0.35);
      ctx.lineWidth = 1;
      for (const th of dense) {
        const [x0, y0] = v.pt(h.pos(th));
        const [x1, y1] = v.pt(h.curvatureCenter(th));
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.restore();
      const tips = [];
      for (let i = 0; i <= 1600; i++) {
        const th = (h.thetaMax * i) / 1600;
        if (Math.abs(h.sinHalf(th)) > 1e-6) tips.push(v.pt(h.curvatureCenter(th)));
      }
      ctx.save();
      ctx.strokeStyle = t.c.rho;
      ctx.lineWidth = 1.4;
      polyline(ctx, tips);
      ctx.stroke();
      ctx.restore();
      for (const th of thetas) {
        const [x0, y0] = v.pt(h.pos(th));
        const [x1, y1] = v.pt(h.curvatureCenter(th));
        arrow(ctx, x0, y0, x1, y1, t.c.n, 2);
        dot2(ctx, x0, y0, 3, t.ink);
      }
    } else {
      const L = 0.14 * h.R * v.s;
      for (const th of thetas) {
        const [x, y] = v.pt(h.pos(th));
        const { tau, n } = h.frame(th);
        arrow(ctx, x, y, x + L * tau[0], y - L * tau[1], t.c.tau, 2.2);
        if (!h.degenerate) arrow(ctx, x, y, x + L * n[0], y - L * n[1], t.c.n, 2.2);
        dot2(ctx, x, y, 3, t.ink);
      }
      // Legend.
      ctx.font = `600 italic 14px ${t.sans}`;
      ctx.fillStyle = t.c.tau;
      ctx.fillText("τ", 14, 22);
      ctx.fillStyle = t.c.n;
      ctx.fillText("n", 32, 22);
    }
    caption.textContent = comb ? tr("frame.captionComb") : tr("frame.captionUnit", { n: count });
  });

  slider(document.getElementById("frame-count"), (value) => {
    count = value;
    output.textContent = String(value);
    view.redraw();
  });
  output.textContent = String(count);
  segmented(root.querySelector("[data-frame-mode]"), (value) => {
    mode = value;
    view.redraw();
  });
  const label = () => (playButton.textContent = tr(playing ? "frame.stop" : "frame.play"));
  playButton.addEventListener("click", () => {
    playing = !playing;
    label();
    anim.kick();
  });
  const anim = loop(canvas, () => playing, (dt) => {
    phase = (phase + dt / (24 * h.q)) % 1;
    view.redraw();
  });
  if (reducedMotion()) playButton.hidden = true;

  store.subscribe((next) => {
    h = next;
    view.redraw();
  });
  onLangChange(label);
  label();
}
