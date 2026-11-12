// Tip-to-tail sums in the polar basis (e_r to the right, e_φ up):
//   v_abs = v_rel + v_arr     a_abs = a_rel + α∧OF + ω∧(ω∧OF) + a_cor

import { norm, state } from "./model.js";
import { VECTOR_INFO, caseButtons, vectorDesc, vectorName, vectorSymbol } from "./lab.js";
import { onLangChange, t as tr } from "./i18n.js";
import { arrow, crisp, fmt, reducedMotion, segmented, setFill, theme, vectorLabel } from "./ui.js";

const GROUPS = {
  v: { terms: ["v_rel", "v_arr"], total: "v_abs", unit: "m/s" },
  a: { terms: ["a_rel", "a_arr_t", "a_arr_n", "a_cor"], total: "a_abs", unit: "m/s²" },
};
const BUILD_SECONDS = 0.55; // per term

export function createSum(report, lab, motions) {
  const root = document.getElementById("soma");
  const slider = root.querySelector("#sum-time");
  const timeLabel = root.querySelector("[data-sum-time-label]");
  const termsList = root.querySelector("[data-sum-terms]");
  const note = root.querySelector("[data-sum-note]");
  const enabled = new Set([...GROUPS.v.terms, ...GROUPS.a.terms]);
  let source = "3";
  let motion = motions["3"];
  let t = motion.tInstant;
  let progress = { v: Infinity, a: Infinity };
  let bounds = null;

  // ---- term toggles
  const values = {};
  const titles = {};
  const descs = {};
  for (const [key, group] of Object.entries(GROUPS)) {
    const title = document.createElement("li");
    title.className = "group-title";
    titles[key] = title;
    termsList.append(title);
    for (const name of [...group.terms, group.total]) {
      const li = document.createElement("li");
      const isTotal = name === group.total;
      li.innerHTML = `<label><input type="checkbox" ${isTotal ? "checked disabled" : "checked"} data-term="${name}">`
        + `${vectorName(name)}<span class="name"><small></small></span><span class="value"></span></label>`;
      values[name] = li.querySelector(".value");
      descs[name] = li.querySelector("small");
      if (!isTotal) {
        li.querySelector("input").addEventListener("change", (event) => {
          if (event.target.checked) enabled.add(name);
          else enabled.delete(name);
          redraw();
        });
      }
      termsList.append(li);
    }
  }

  function computeBounds() {
    // Stable zoom: the extent of every partial sum over the whole motion.
    const out = {};
    for (const [key, group] of Object.entries(GROUPS)) {
      let ext = 1e-12;
      for (let i = 0; i <= 160; i++) {
        const e = state(motion, (motion.tf * i) / 160);
        let x = 0;
        let y = 0;
        for (const name of group.terms) {
          x += e.vec[name][0];
          y += e.vec[name][1];
          ext = Math.max(ext, Math.abs(x), Math.abs(y), Math.abs(e.vec[name][0]), Math.abs(e.vec[name][1]));
        }
      }
      out[key] = ext;
    }
    return out;
  }

  const draw = (key) => (ctx, w, h) => {
    if (!bounds) return;
    const th = theme();
    const group = GROUPS[key];
    const e = state(motion, t);
    // Zoom follows the instant, but never past 4× the zoom that fits the whole motion.
    let ext = 0;
    let sx = 0;
    let sy = 0;
    for (const name of group.terms) {
      sx += e.vec[name][0];
      sy += e.vec[name][1];
      ext = Math.max(ext, Math.abs(sx), Math.abs(sy), ...e.vec[name].map(Math.abs));
    }
    ext = Math.max(ext, 0.25 * bounds[key]);
    const k = (Math.min(w, h) / 2 - 34) / (ext * 1.1);
    const cx = w / 2;
    const cy = h / 2;
    const P = (x, y) => [cx + x * k, cy - y * k];

    // Grid and polar axes.
    ctx.strokeStyle = th.grid;
    ctx.lineWidth = 1;
    const stepPx = niceStep(ext / 4) * k;
    for (let s = -Math.floor(cx / stepPx); s <= Math.floor(cx / stepPx); s++) {
      ctx.beginPath();
      ctx.moveTo(cx + s * stepPx, 0);
      ctx.lineTo(cx + s * stepPx, h);
      ctx.stroke();
    }
    for (let s = -Math.floor(cy / stepPx); s <= Math.floor(cy / stepPx); s++) {
      ctx.beginPath();
      ctx.moveTo(0, cy + s * stepPx);
      ctx.lineTo(w, cy + s * stepPx);
      ctx.stroke();
    }
    ctx.strokeStyle = th.ink3;
    ctx.beginPath();
    ctx.moveTo(10, cy);
    ctx.lineTo(w - 10, cy);
    ctx.moveTo(cx, h - 10);
    ctx.lineTo(cx, 10);
    ctx.stroke();
    ctx.fillStyle = th.ink3;
    ctx.font = `italic 600 13px ${th.sans}`;
    ctx.textBaseline = "middle";
    ctx.fillText("e", w - 26, cy - 12);
    ctx.fillText("e", cx + 8, 18);
    ctx.font = `500 9px ${th.mono}`;
    ctx.fillText("r", w - 18, cy - 8);
    ctx.fillText("φ", cx + 16, 22);
    ctx.font = `500 10px ${th.mono}`;
    ctx.fillText(`${tr("sum.grid")}: ${fmt(niceStep(ext / 4), stepDigits(ext / 4))} ${group.unit}`, 10, h - 12);

    // Tip-to-tail.
    let x = 0;
    let y = 0;
    let remaining = progress[key];
    for (const name of group.terms) {
      if (!enabled.has(name)) continue;
      const [vx, vy] = e.vec[name];
      const share = Math.max(0, Math.min(1, remaining));
      remaining -= 1;
      if (share <= 0) break;
      const [x0, y0] = P(x, y);
      const [x1, y1] = P(x + vx * share, y + vy * share);
      arrow(ctx, x0, y0, x1, y1, th.vec[name], 2.4);
      if (share === 1 && Math.hypot(x1 - x0, y1 - y0) > 40) {
        const mx = (x0 + x1) / 2;
        const my = (y0 + y1) / 2;
        const nx = -(y1 - y0) / Math.hypot(x1 - x0, y1 - y0);
        const ny = (x1 - x0) / Math.hypot(x1 - x0, y1 - y0);
        labelTerm(ctx, name, mx + nx * 14 - 10, my + ny * 14, th);
      }
      x += vx * share;
      y += vy * share;
    }

    const done = progress[key] >= group.terms.filter((n) => enabled.has(n)).length;
    const total = e.vec[group.total];
    const [ox, oy] = P(0, 0);
    const [tx, ty] = P(total[0], total[1]);
    if (done) {
      arrow(ctx, ox, oy, tx, ty, th.vec[group.total], 3, 0.95);
      if (Math.hypot(tx - ox, ty - oy) > 20) labelTerm(ctx, group.total, (ox + tx) / 2 + 8, (oy + ty) / 2 + 14, th);
      const [px, py] = P(x, y);
      const gap = Math.hypot(tx - px, ty - py);
      if (gap > 2) {
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = th.ink2;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = th.ink2;
        ctx.font = `500 11px ${th.mono}`;
        ctx.fillText(tr("sum.missing"), (px + tx) / 2 + 6, (py + ty) / 2 - 8);
      }
    }
    ctx.fillStyle = th.ink;
    ctx.beginPath();
    ctx.arc(ox, oy, 3, 0, 2 * Math.PI);
    ctx.fill();
  };

  const views = { v: crisp(root.querySelector("#sum-v"), draw("v")), a: crisp(root.querySelector("#sum-a"), draw("a")) };

  function redraw() {
    views.v.redraw();
    views.a.redraw();
    const e = state(motion, t);
    for (const name of Object.keys(values)) values[name].textContent = fmt(norm(e.vec[name]), 3);
    timeLabel.textContent = `${fmt(t, 2)} s`;
    slider.value = String(Math.round((t / motion.tf) * 1000));
    setFill(slider);
    const zero = GROUPS.a.terms.filter((n) => norm(e.vec[n]) < 1e-9 * Math.max(1, norm(e.vec.a_abs)));
    const missing = GROUPS.a.terms.filter((n) => !enabled.has(n) && !zero.includes(n));
    const parts = [];
    if (zero.length) parts.push(tr(zero.length > 1 ? "sum.zeroMany" : "sum.zeroOne", { list: zero.map(vectorSymbol).join(tr("sum.and")) }));
    parts.push(tr(missing.length ? "sum.open" : "sum.closed"));
    note.innerHTML = parts.join(" ");
  }

  let raf = 0;
  function build() {
    cancelAnimationFrame(raf);
    if (reducedMotion()) {
      progress = { v: Infinity, a: Infinity };
      redraw();
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const p = (now - start) / 1000 / BUILD_SECONDS;
      progress = { v: p, a: p };
      redraw();
      if (p < 5) raf = requestAnimationFrame(step);
      else progress = { v: Infinity, a: Infinity };
    };
    raf = requestAnimationFrame(step);
  }

  function setSource(key) {
    source = key;
    motion = key === "lab" ? lab.current().motion : motions[key];
    t = Math.min(motion.tInstant, motion.tf);
    bounds = computeBounds();
    redraw();
  }

  const caseRoot = root.querySelector("[data-sum-case]");
  const renderText = () => {
    caseButtons(caseRoot, report, source, true);
    titles.v.textContent = tr("sum.velocity");
    titles.a.textContent = tr("sum.acceleration");
    for (const name of Object.keys(descs)) descs[name].textContent = vectorDesc(name);
  };
  renderText();
  onLangChange(() => {
    renderText();
    redraw();
  });
  segmented(caseRoot, (value) => {
    setSource(value);
    build();
  });
  lab.onChange(() => source === "lab" && setSource("lab"));
  slider.addEventListener("input", () => {
    t = (Number(slider.value) / 1000) * motion.tf;
    progress = { v: Infinity, a: Infinity };
    redraw();
  });
  root.querySelector("[data-sum-build]").addEventListener("click", build);

  setSource("3");
  let built = false;
  new IntersectionObserver((entries) => {
    if (!built && entries.some((entry) => entry.isIntersecting)) {
      built = true;
      build();
    }
  }, { threshold: 0.35 }).observe(root.querySelector("#sum-a"));
}

function labelTerm(ctx, name, x, y, th) {
  const info = VECTOR_INFO[name];
  if (info.sub) vectorLabel(ctx, name, x, y, th.vec[name], 14);
  else {
    ctx.save();
    ctx.fillStyle = th.vec[name];
    ctx.font = `600 italic 12px ${th.sans}`;
    ctx.textBaseline = "middle";
    ctx.fillText(info.label, x, y);
    ctx.restore();
  }
}

function niceStep(raw) {
  const exponent = Math.floor(Math.log10(raw));
  const base = raw / 10 ** exponent;
  const nice = base < 1.5 ? 1 : base < 3.5 ? 2 : base < 7.5 ? 5 : 10;
  return nice * 10 ** exponent;
}
const stepDigits = (raw) => Math.max(0, -Math.floor(Math.log10(niceStep(raw))));
