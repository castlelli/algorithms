// 01 · The rolling disk (items 1.1–1.3): radii, animation, instant centre and snapshots.
// Also owns the shared store with the current R and r, which sections 03–05 follow.

import { hypocycloid } from "./model.js";
import { curvePoints, drawCusps, drawDisk, drawPartial, drawRing, drawTrace } from "./scene.js";
import { onLangChange, t as tr, turns } from "./i18n.js";
import { crisp, fmt, fmtSig, fmtVec, loop, planeView, reducedMotion, segmented, slider, theme, toggle } from "./ui.js";

/** Shared R and r; subscribers get the hypocycloid on each valid change. */
export function createStore(R, r) {
  const listeners = new Set();
  const store = {
    h: hypocycloid(R, r),
    set(nextR, nextr) {
      store.h = hypocycloid(nextR, nextr);
      for (const f of listeners) f(store.h);
    },
    subscribe(f) {
      listeners.add(f);
    },
  };
  return store;
}

const TURN_SECONDS = 6; // one turn of the disk's centre at 1×
const HOLD = 1.2;

export function createLab(store) {
  const root = document.getElementById("lab");
  const q = (sel) => root.querySelector(sel);
  const out = Object.fromEntries([...root.querySelectorAll("[data-lab-out]")].map((el) => [el.dataset.labOut, el]));
  const error = q("[data-lab-error]");
  const facts = q("[data-lab-facts]");
  const caption = q("[data-lab-caption]");
  const playButton = q("[data-lab-play]");
  const show = { contact: true, velocity: true, cusps: false };

  let h = store.h;
  let theta = 0;
  let speed = 1;
  let playing = !reducedMotion();
  let hold = 0;

  const draw = (ctx, w, hgt, hh, theta0, options) => {
    const t = theme();
    const v = planeView(w, hgt, hh.R * 1.12, 0, 0, 8);
    drawTrace(ctx, v, curvePoints(hh), t.c.curve, 1, 0.13);
    drawRing(ctx, v, hh);
    drawPartial(ctx, v, hh, theta0, t.c.curve, options.width ?? 2.4);
    if (options.cusps) drawCusps(ctx, v, hh);
    drawDisk(ctx, v, hh, theta0, options);
  };

  const view = crisp(document.getElementById("lab-scene"), (ctx, w, hgt) => {
    draw(ctx, w, hgt, h, theta, { contact: show.contact, velocity: show.velocity, cusps: show.cusps, labels: true });
    const P = h.pos(theta);
    caption.textContent = tr("lab.caption", { theta: fmt(theta, 3), P: fmtVec(P, 3) });
    out.theta.textContent = `${fmt(theta, 2)} rad`;
  });

  const thetaSlider = slider(document.getElementById("lab-theta"), (value) => {
    theta = (value / 1000) * h.thetaMax;
    hold = 0;
    setPlaying(false);
    view.redraw();
  });
  const syncSlider = () => thetaSlider.set(Math.round((theta / h.thetaMax) * 1000));

  const renderFacts = () => {
    const rows = [
      [tr("lab.fraction"), h.q === 1 ? String(h.p) : `${h.p}/${h.q}`],
      [tr("lab.cuspsFact"), String(h.p)],
      [tr("lab.turnsFact"), `${h.q}`],
      [tr("lab.lengthFact"), fmtSig(h.length, 4)],
      [tr("lab.rhoMaxFact"), h.degenerate ? "∞" : fmtSig(h.rhoMax, 4)],
    ];
    facts.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
    error.textContent = h.degenerate ? tr("lab.degenerate") : "";
    error.classList.toggle("info", h.degenerate);
  };

  // Radii. R ≤ r is rejected (the store keeps the last valid curve).
  const Rs = document.getElementById("lab-R");
  const rs = document.getElementById("lab-r");
  const onRadii = () => {
    const R = Number(Rs.value);
    const r = Number(rs.value);
    out.R.textContent = fmt(R, 2);
    out.r.textContent = fmt(r, 2);
    if (!(R > r)) {
      error.textContent = tr("lab.errRr");
      error.classList.remove("info");
      return;
    }
    const frac = theta / h.thetaMax;
    store.set(R, r);
    h = store.h;
    theta = frac * h.thetaMax;
    renderFacts();
    view.redraw();
  };
  slider(Rs, onRadii);
  slider(rs, onRadii);
  out.R.textContent = fmt(h.R, 2);
  out.r.textContent = fmt(h.r, 2);

  for (const button of root.querySelectorAll("[data-lab-toggle]")) {
    toggle(button, (on) => {
      show[button.dataset.labToggle] = on;
      view.redraw();
    });
  }

  const label = () => (playButton.textContent = tr(playing ? "lab.pause" : "lab.play"));
  const setPlaying = (on) => {
    playing = on;
    label();
    if (on) anim.kick();
  };
  playButton.addEventListener("click", () => {
    if (!playing && theta >= h.thetaMax) theta = 0;
    setPlaying(!playing);
  });
  q("[data-lab-restart]").addEventListener("click", () => {
    theta = 0;
    hold = 0;
    syncSlider();
    view.redraw();
    if (!reducedMotion()) setPlaying(true);
  });
  segmented(q("[data-lab-speed]"), (value) => (speed = Number(value)));

  const anim = loop(document.getElementById("lab-scene"), () => playing, (dt) => {
    if (theta < h.thetaMax) {
      theta = Math.min(h.thetaMax, theta + ((2 * Math.PI) / TURN_SECONDS) * speed * dt);
    } else if ((hold += dt) > HOLD) {
      theta = 0;
      hold = 0;
    }
    syncSlider();
    view.redraw();
  });

  // Snapshots (item 1.3).
  const list = q("[data-snaps]");
  const snaps = [];
  const renderSnaps = () => {
    list.replaceChildren();
    if (!snaps.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = tr("lab.snapEmpty");
      list.append(li);
      return;
    }
    snaps.forEach((s, i) => {
      const li = document.createElement("li");
      const canvas = document.createElement("canvas");
      canvas.setAttribute("aria-label", tr("lab.snapAria", { theta: fmt(s.theta, 3) }));
      const cap = document.createElement("p");
      cap.innerHTML = `<span>${String(i + 1).padStart(2, "0")}</span> θ = ${fmt(s.theta, 3)} rad`;
      li.append(canvas, cap);
      list.append(li);
      crisp(canvas, (ctx, w, hgt) => draw(ctx, w, hgt, s.h, s.theta, { contact: true, velocity: true, width: 1.8 }));
    });
  };
  q("[data-snap='now']").addEventListener("click", () => {
    snaps.push({ h, theta });
    if (snaps.length > 12) snaps.shift();
    renderSnaps();
  });
  q("[data-snap='six']").addEventListener("click", () => {
    snaps.length = 0;
    for (let j = 0; j < 6; j++) snaps.push({ h, theta: (h.thetaMax * (j + 0.5)) / 6 });
    renderSnaps();
  });
  q("[data-snap='clear']").addEventListener("click", () => {
    snaps.length = 0;
    renderSnaps();
  });

  onLangChange(() => {
    label();
    renderFacts();
    renderSnaps();
  });
  renderFacts();
  renderSnaps();
  label();
  if (reducedMotion()) theta = h.thetaMax * 0.62;
  syncSlider();
  view.redraw();
}
