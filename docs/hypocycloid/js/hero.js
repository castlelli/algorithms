// Cover: the disk rolls and draws the curve; after each closed curve the ratio R/r changes.

import { hypocycloid, norm } from "./model.js";
import { curvePoints, drawDisk, drawPartial, drawRing, drawTrace } from "./scene.js";
import { onLangChange, t as tr, turns } from "./i18n.js";
import { crisp, fmt, loop, planeView, reducedMotion, theme } from "./ui.js";

// R/r as p/q, all with R = 5 so the ring keeps its size.
const RATIOS = [[5, 1], [7, 2], [3, 1], [5, 2], [4, 1], [8, 5], [11, 3]];
const HOLD = 1.6; // seconds with the finished curve before the next ratio
const FADE = 0.6;

export function createHero(canvas) {
  const dials = Object.fromEntries([...document.querySelectorAll("[data-hero]")].map((el) => [el.dataset.hero, el]));
  let index = 0;
  let h = null;
  let previous = null; // the last finished curve, fading out
  let theta = 0;
  let hold = 0;
  let fade = 0;
  let lastText = -1;

  const setRatio = (i) => {
    const [p, q] = RATIOS[i % RATIOS.length];
    h = hypocycloid(5, (5 * q) / p);
    theta = 0;
    hold = 0;
    caption();
  };
  const caption = () => {
    dials.ratio.textContent = fmt(h.R / h.r, 3).replace(/[.,]?0+$/, "");
    dials.frac.textContent = h.q === 1 ? "" : `= ${h.p}/${h.q}`;
    dials.caption.textContent = tr("hero.caption", { frac: h.q === 1 ? String(h.p) : `${h.p}/${h.q}`, p: h.p, q: h.q, turns: turns(h.q) });
  };
  onLangChange(caption);
  setRatio(0);

  const view = crisp(canvas, (ctx, w, hgt) => {
    const t = theme();
    const v = planeView(w, hgt, h.R * 1.12, 0, 0, 8);
    if (previous && fade > 0) drawTrace(ctx, v, curvePoints(previous), t.c.curve, 2, fade);
    drawTrace(ctx, v, curvePoints(h), t.c.curve, 1, 0.12);
    drawRing(ctx, v, h);
    drawPartial(ctx, v, h, Math.min(theta, h.thetaMax), t.c.curve, 2.4);
    drawDisk(ctx, v, h, Math.min(theta, h.thetaMax), { contact: true, velocity: true, labels: w > 380 });
    const now = performance.now();
    if (now - lastText > 90) {
      lastText = now;
      const th = Math.min(theta, h.thetaMax);
      dials.theta.textContent = fmt(th, 2);
      dials.speed.textContent = fmt(norm(h.d1(th)), 2);
      dials.rho.textContent = fmt(h.rhoClosed(th), 2);
    }
  });

  if (reducedMotion()) {
    theta = h.thetaMax * 0.62;
    view.redraw();
    return;
  }
  // One closed curve takes about 5 s per turn of the centre, a little faster for long ones.
  const rate = () => (2 * Math.PI) / (5 * Math.max(0.6, h.q ** -0.25));
  loop(canvas, () => true, (dt) => {
    if (fade > 0) fade = Math.max(0, fade - dt / FADE);
    if (theta < h.thetaMax) {
      theta = Math.min(h.thetaMax, theta + rate() * dt);
    } else {
      hold += dt;
      if (hold > HOLD) {
        previous = h;
        fade = 1;
        index += 1;
        setRatio(index);
      }
    }
    view.redraw();
  });
}
