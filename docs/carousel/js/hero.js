// Cover: case 3 running in a loop, with the report's alternating arrows and live dials.

import { ACCELERATIONS, VELOCITIES, norm } from "./model.js";
import { drawScene, prepare } from "./scene.js";
import { crisp, fmt, reducedMotion, whenVisible } from "./ui.js";

const HOLD = 1.4; // seconds paused at the centre before starting again

export function createHero(canvas, motion) {
  const prep = prepare(motion);
  const dials = Object.fromEntries([...document.querySelectorAll("[data-hero]")].map((el) => [el.dataset.hero, el]));
  let t = reducedMotion() ? motion.tInstant : 0;
  let clock = 0;
  let lastText = -1;

  const view = crisp(canvas, (ctx, w, h) => {
    const vectors = motion.group(t) === "vel" ? VELOCITIES : ACCELERATIONS;
    const { e } = drawScene(ctx, w, h, prep, t, { vectors, labels: w > 360, half: 1.6 * motion.R });
    const now = performance.now();
    if (now - lastText > 90) {
      lastText = now;
      dials.t.textContent = fmt(t, 2);
      dials.omega.textContent = fmt(e.omega, 3);
      dials.v.textContent = fmt(norm(e.vec.v_abs), 3);
      dials.cor.textContent = fmt(norm(e.vec.a_cor), 3);
    }
  });

  if (reducedMotion()) return;
  let visible = true;
  let frame = 0;
  let previous = 0;
  const tick = (now) => {
    const step = previous ? Math.min(0.05, (now - previous) / 1000) : 0;
    previous = now;
    clock += step;
    if (clock > motion.tf + HOLD) clock = 0;
    t = Math.min(clock, motion.tf);
    view.redraw();
    frame = visible ? requestAnimationFrame(tick) : 0;
  };
  whenVisible(canvas, (on) => {
    visible = on;
    if (on && !frame) {
      previous = 0;
      frame = requestAnimationFrame(tick);
    }
  });
}
