// Laboratory: type ω(t), v(t), R, φ₀ and Δt; watch the motion from the ground or riding the
// carousel, with the report's alternating arrows, live readouts and the full vector table.

import { toLatex } from "./expr.js";
import { localLatex, onLangChange, t as tr } from "./i18n.js";
import { ACCELERATIONS, TABLE_ROWS, VELOCITIES, createMotion, norm } from "./model.js";
import { drawScene, prepare } from "./scene.js";
import { crisp, fmt, fmtSig, reducedMotion, segmented, setFill, tex, whenVisible } from "./ui.js";

export const VECTOR_INFO = {
  v_rel: { label: "v", sub: "rel" },
  v_arr: { label: "v", sub: "arr" },
  v_abs: { label: "v", sub: "abs" },
  a_rel: { label: "a", sub: "rel" },
  a_arr: { label: "a", sub: "arr" },
  a_arr_t: { label: "α∧OF", sub: "" },
  a_arr_n: { label: "ω∧(ω∧OF)", sub: "" },
  a_cor: { label: "a", sub: "cor" },
  a_abs: { label: "a", sub: "abs" },
};

export const vectorDesc = (name) => tr(`vec.${name}`);

export function vectorSymbol(name) {
  const info = VECTOR_INFO[name];
  return info.sub ? `<i>${info.label}</i><sub>${info.sub}</sub>` : `<i>${info.label}</i>`;
}

export function vectorName(name) {
  const color = `var(--${name.replaceAll("_", "-")})`;
  return `<span class="vec-name"><span class="arrow-swatch" style="color: ${color}" aria-hidden="true"></span><span>${vectorSymbol(name)}</span></span>`;
}

/** Case title and short label, translated (the report's own text is Portuguese). */
export const caseTitle = (entry) => tr("case.title", { n: entry.numero });
export const caseLabel = (entry) => tr(`case.label.${entry.numero}`);

/** Fills a segmented control with the report's cases (and optionally "from the lab"). */
export function caseButtons(root, report, selected, withLab) {
  const value = root.querySelector('[aria-pressed="true"]')?.dataset.value ?? selected;
  root.innerHTML = report.casos.map((c) => `<button type="button" data-value="${c.numero}" aria-pressed="${String(c.numero) === value}">${caseTitle(c)}</button>`).join("")
    + (withLab ? `<button type="button" data-value="lab" aria-pressed="${value === "lab"}">${tr("case.fromLab")}</button>` : "");
}

const parseNumber = (text) => String(text).trim().replace(",", ".");

export function createLab(report) {
  const root = document.getElementById("lab");
  const form = root.querySelector("[data-lab-form]");
  const error = root.querySelector("[data-lab-error]");
  const note = root.querySelector("[data-lab-note]");
  const laws = root.querySelector("[data-lab-laws]");
  const badge = root.querySelector("[data-lab-group]");
  const scaleNote = root.querySelector("[data-lab-scale]");
  const frameNote = root.querySelector("[data-lab-frame-note]");
  const playButton = root.querySelector("[data-lab-play]");
  const slider = root.querySelector("#lab-time");
  const timeLabel = root.querySelector("[data-lab-time-label]");
  const readout = root.querySelector("[data-lab-readout]");
  const tableBody = root.querySelector("[data-lab-table]");
  const chipsRoot = root.querySelector("[data-lab-cases]");
  const listeners = [];

  let motion = null;
  let prep = null;
  let entry = null; // the report case when the inputs match one
  let caseKey = null;
  let t = 0;
  let playing = false;
  let speed = 1;
  let frame = "ground";
  let mode = "alt";
  let visible = false;
  let raf = 0;
  let lastTable = 0;

  // ---- case chips
  const chips = [...report.casos.map((c) => String(c.numero)), "custom"];
  for (const key of chips) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.case = key;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => (key === "custom" ? selectCustom() : selectCase(key)));
    chipsRoot.append(button);
  }
  function renderChips() {
    for (const button of chipsRoot.querySelectorAll("button")) {
      const key = button.dataset.case;
      const c = report.casos.find((x) => String(x.numero) === key);
      const title = c ? caseTitle(c) : tr("lab.custom");
      const label = c ? caseLabel(c) : tr("lab.customLabel");
      button.innerHTML = `<strong>${title}</strong><span>${label}</span>`;
    }
  }
  const markChip = (key) => {
    for (const b of chipsRoot.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.case === key));
  };

  // ---- readout cells
  const cells = [
    ["t", "<i>t</i> [s]"], ["tf", "<i>t</i><sub>f</sub> [s]"], ["r", "<i>r</i> [m]"], ["phi", "<i>φ</i> [rad]"],
    ["omega", "<i>ω</i> [rad/s]"], ["alpha", "<i>α</i> [rad/s²]"], ["v", "<i>v</i> [m/s]"], ["vdot", "<i>v̇</i> [m/s²]"],
  ];
  const out = {};
  for (const [key, label] of cells) {
    const div = document.createElement("div");
    div.innerHTML = `<dt>${label}</dt><dd>–</dd>`;
    out[key] = div.querySelector("dd");
    readout.append(div);
  }

  // ---- vector table
  const rows = {};
  const descs = {};
  for (const name of TABLE_ROWS) {
    const tr2 = document.createElement("tr");
    if (name === "a_arr_t" || name === "a_arr_n") tr2.className = "sub";
    if (name.endsWith("abs")) tr2.classList.add("total");
    tr2.innerHTML = `<td>${vectorName(name)} <span class="vec-desc"></span></td><td></td><td></td><td></td><td></td><td></td>`;
    rows[name] = [...tr2.querySelectorAll("td")].slice(1);
    descs[name] = tr2.querySelector(".vec-desc");
    tableBody.append(tr2);
  }
  const renderDescs = () => {
    for (const name of TABLE_ROWS) descs[name].textContent = vectorDesc(name);
  };

  const view = crisp(root.querySelector("#lab-scene"), (ctx, w, h) => {
    if (!prep) return;
    const group = motion.group(t);
    const shown = mode === "alt" ? group : mode;
    const vectors = shown === "vel" ? VELOCITIES : ACCELERATIONS;
    const faded = frame === "carousel" ? vectors.filter((n) => !n.endsWith("rel")) : [];
    drawScene(ctx, w, h, prep, t, { frame, vectors, faded, labels: w > 300 });
    badge.textContent = tr(shown === "vel" ? "lab.badgeVel" : "lab.badgeAcc");
    badge.dataset.group = shown;
    const now = performance.now();
    if (now - lastTable > 80 || !playing) {
      lastTable = now;
      updateNumbers(shown);
    }
  });

  function updateNumbers(shown) {
    const e = motion.state(t);
    out.t.textContent = fmt(t, 3);
    out.tf.textContent = fmt(motion.tf, 3) + (motion.arrived ? "" : tr("lab.noArrival"));
    out.r.textContent = fmt(e.r, 4);
    out.phi.textContent = fmt(e.phi, 4);
    out.omega.textContent = fmt(e.omega, 4);
    out.alpha.textContent = fmt(e.alpha, 4);
    out.v.textContent = fmt(e.v, 4);
    out.vdot.textContent = fmt(e.vdot, 4);
    for (const name of TABLE_ROWS) {
      const polar = e.vec[name];
      const cart = e.cart(name);
      const cellsOf = rows[name];
      cellsOf[0].textContent = fmt(polar[0], 4);
      cellsOf[1].textContent = fmt(polar[1], 4);
      cellsOf[2].textContent = fmt(cart[0], 4);
      cellsOf[3].textContent = fmt(cart[1], 4);
      cellsOf[4].textContent = fmt(norm(polar), 4);
      const isVel = name.startsWith("v");
      cellsOf[0].parentElement.classList.toggle("dim", (shown === "vel") !== isVel);
    }
    timeLabel.textContent = tr("lab.timeOf", { t: fmt(t, 2), tf: fmt(motion.tf, 2) });
    slider.value = String(Math.round((t / motion.tf) * 1000));
    setFill(slider);
  }

  function renderLaws() {
    laws.replaceChildren();
    const add = (latex, cls = "law") => {
      const div = document.createElement("div");
      div.className = cls;
      tex(div, latex);
      laws.append(div);
    };
    const m = motion;
    const omega = entry ? localLatex(entry.latex.omega) : toLatex(m.omegaTree);
    const v = entry ? localLatex(entry.latex.v) : toLatex(m.vTree);
    add(`\\omega(t) = ${omega}\\ \\mathrm{rad/s}`);
    add(`v(t) = ${v}\\ \\mathrm{m/s}`);
    if (entry?.latex.r) {
      add(`r(t) = ${localLatex(entry.latex.r)}\\ \\mathrm{m}`);
      add(`\\varphi(t) = ${localLatex(entry.latex.phi)}\\ \\mathrm{rad}`);
    } else {
      add(`r(t) = R - \\textstyle\\int_0^t v\\,d\\tau`);
      add(`\\varphi(t) = \\varphi_0 + \\textstyle\\int_0^t \\omega\\,d\\tau`);
    }
    add(`t_f = ${fmtSig(m.tf, 5).replace(",", "{,}").replace("−", "-")}\\ \\mathrm{s}`);
    const small = document.createElement("p");
    small.className = "law-note";
    small.textContent = tr(entry ? "lab.lawsExact" : "lab.lawsNumeric");
    laws.append(small);
  }

  function renderScale() {
    const s = motion.scales;
    scaleNote.textContent = tr("lab.scale", { v: fmtSig(motion.R / s.vel, 3), a: fmtSig(motion.R / s.acc, 3) });
  }

  function apply(params, preset) {
    try {
      motion = createMotion(params);
    } catch (problem) {
      error.textContent = problem.message;
      for (const input of form.elements) input.setAttribute("aria-invalid", String(input.name === problem.field));
      return false;
    }
    error.textContent = "";
    for (const input of form.elements) input.setAttribute("aria-invalid", "false");
    entry = preset ?? null;
    prep = prepare(motion);
    t = 0;
    renderScale();
    renderLaws();
    view.redraw();
    for (const listener of listeners) listener();
    return true;
  }

  function fill(params) {
    form.elements.omega.value = params.omega;
    form.elements.v.value = params.v;
    form.elements.R.value = String(params.R);
    form.elements.phi0.value = params.phi0;
    form.elements.dt.value = String(params.dt);
  }

  const renderNote = () => (note.innerHTML = tr(`case.note.${caseKey}`));

  function selectCase(key) {
    const preset = report.casos.find((c) => String(c.numero) === key);
    caseKey = key;
    markChip(key);
    renderNote();
    fill(preset.params);
    apply({ ...preset.params }, preset);
    setPlaying(!reducedMotion() && visible);
  }

  function selectCustom() {
    caseKey = "custom";
    markChip("custom");
    renderNote();
    form.elements.omega.focus();
    form.elements.omega.select();
  }

  function readForm() {
    const params = {
      omega: form.elements.omega.value,
      v: form.elements.v.value,
      R: parseNumber(form.elements.R.value),
      phi0: parseNumber(form.elements.phi0.value),
      dt: parseNumber(form.elements.dt.value),
    };
    const preset = report.casos.find((c) => c.params.omega === params.omega && c.params.v === params.v
      && Number(c.params.R) === Number(params.R) && c.params.phi0 === params.phi0 && c.params.dt === Number(params.dt));
    return { params, preset };
  }

  let debounce = 0;
  form.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const { params, preset } = readForm();
      if (apply(params, preset)) {
        caseKey = preset ? String(preset.numero) : "custom";
        markChip(caseKey);
        renderNote();
        setPlaying(!reducedMotion());
      }
    }, 280);
  });
  form.addEventListener("submit", (event) => event.preventDefault());

  // ---- transport
  function renderPlay() {
    playButton.textContent = tr(playing ? "lab.pause" : t >= motion.tf ? "lab.replay" : "lab.play");
    playButton.setAttribute("aria-label", playButton.textContent);
  }
  function setPlaying(on) {
    playing = on;
    renderPlay();
    if (on && !raf) {
      previous = 0;
      raf = requestAnimationFrame(tick);
    }
  }
  let previous = 0;
  function tick(now) {
    raf = 0;
    if (!playing || !visible) return;
    const step = previous ? Math.min(0.05, (now - previous) / 1000) : 0;
    previous = now;
    t = Math.min(motion.tf, t + step * speed);
    view.redraw();
    if (t >= motion.tf) {
      setPlaying(false);
      updateNumbers(mode === "alt" ? motion.group(t) : mode);
      return;
    }
    raf = requestAnimationFrame(tick);
  }
  playButton.addEventListener("click", () => {
    if (!playing && t >= motion.tf) t = 0;
    setPlaying(!playing);
  });
  root.querySelector("[data-lab-restart]").addEventListener("click", () => {
    t = 0;
    view.redraw();
    setPlaying(!reducedMotion());
  });
  slider.addEventListener("input", () => {
    t = (Number(slider.value) / 1000) * motion.tf;
    setPlaying(false);
    view.redraw();
  });
  const renderFrameNote = () => (frameNote.innerHTML = tr(frame === "ground" ? "lab.frameGround" : "lab.frameCarousel"));
  segmented(root.querySelector("[data-lab-speed]"), (value) => (speed = Number(value)));
  segmented(root.querySelector("[data-lab-frame]"), (value) => {
    frame = value;
    renderFrameNote();
    view.redraw();
  });
  segmented(root.querySelector("[data-lab-vectors]"), (value) => {
    mode = value;
    view.redraw();
  });

  whenVisible(root.querySelector("#lab-scene"), (on) => {
    const first = on && !visible && previous === 0 && t === 0;
    visible = on;
    if (on && (playing || first) && !reducedMotion()) setPlaying(true);
  });

  onLangChange(() => {
    renderChips();
    renderDescs();
    renderNote();
    renderFrameNote();
    renderPlay();
    if (error.textContent) {
      // Re-run the inputs so the error message comes out in the new language.
      const { params } = readForm();
      try {
        createMotion(params);
      } catch (problem) {
        error.textContent = problem.message;
      }
    }
    renderScale();
    renderLaws();
  });

  renderChips();
  renderDescs();
  renderFrameNote();
  selectCase("1");

  return {
    current: () => ({ motion, caseKey }),
    onChange: (listener) => listeners.push(listener),
  };
}
