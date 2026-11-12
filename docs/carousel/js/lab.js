// Laboratory: type ω(t), v(t), R, φ₀ and Δt; watch the motion from the ground or riding the
// carousel, with the report's alternating arrows, live readouts and the full vector table.

import { toLatex } from "./expr.js";
import { ACCELERATIONS, TABLE_ROWS, VELOCITIES, createMotion, norm } from "./model.js";
import { drawScene, prepare } from "./scene.js";
import { crisp, fmt, fmtSig, reducedMotion, segmented, setFill, tex, whenVisible } from "./ui.js";

export const CASE_NOTES = {
  1: "Referência que se confere à mão: α = 0 e v̇ = 0, então a aceleração relativa e a parcela tangencial somem. |<i>a</i><sub>cor</sub>| = 2<i>ωv</i> fica constante e <i>t</i><sub>f</sub> = <i>R</i>/<i>v</i>.",
  2: "O carrossel acelera com α constante: surge a parcela tangencial α∧OF da aceleração de arrastamento. A centrípeta cresce com ω² enquanto r diminui.",
  3: "ω troca de sinal em t = π/0,7 ≈ 4,49 s: o carrossel para e passa a girar no sentido horário. Com v variável, todas as parcelas são não nulas.",
  custom: "Caso personalizado. As leis r(t) e φ(t) saem da integração numérica feita aqui, e α e v̇ da derivada exata das expressões digitadas.",
};

export const VECTOR_INFO = {
  v_rel: { label: "v", sub: "rel", desc: "relativa" },
  v_arr: { label: "v", sub: "arr", desc: "de arrastamento" },
  v_abs: { label: "v", sub: "abs", desc: "absoluta" },
  a_rel: { label: "a", sub: "rel", desc: "relativa" },
  a_arr: { label: "a", sub: "arr", desc: "de arrastamento" },
  a_arr_t: { label: "α∧OF", sub: "", desc: "parcela tangencial" },
  a_arr_n: { label: "ω∧(ω∧OF)", sub: "", desc: "parcela centrípeta" },
  a_cor: { label: "a", sub: "cor", desc: "de Coriolis" },
  a_abs: { label: "a", sub: "abs", desc: "absoluta" },
};

export function vectorName(name) {
  const info = VECTOR_INFO[name];
  const symbol = info.sub ? `<i>${info.label}</i><sub>${info.sub}</sub>` : `<i>${info.label}</i>`;
  const color = `var(--${name.replaceAll("_", "-")})`;
  return `<span class="vec-name"><span class="arrow-swatch" style="color: ${color}" aria-hidden="true"></span><span>${symbol}</span></span>`;
}

const FRAME_NOTES = {
  ground: "Visto do chão, a formiga descreve uma espiral: é a trajetória absoluta.",
  carousel: "Visto do carrossel, a formiga anda em linha reta até o centro e é o chão que gira. Quem anda no carrossel mede <i>v</i><sub>rel</sub> e <i>a</i><sub>rel</sub>; as outras setas ficam apagadas.",
};

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
  const chips = [...report.casos.map((c) => ({ key: String(c.numero), title: c.titulo, label: c.rotulo })),
    { key: "custom", title: "Personalizado", label: "suas funções ω(t) e v(t)" }];
  for (const chip of chips) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.case = chip.key;
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = `<strong>${chip.title}</strong><span>${chip.label}</span>`;
    button.addEventListener("click", () => (chip.key === "custom" ? selectCustom() : selectCase(chip.key)));
    chipsRoot.append(button);
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
  for (const name of TABLE_ROWS) {
    const tr = document.createElement("tr");
    if (name === "a_arr_t" || name === "a_arr_n") tr.className = "sub";
    if (name.endsWith("abs")) tr.classList.add("total");
    const info = VECTOR_INFO[name];
    tr.innerHTML = `<td>${vectorName(name)} <span class="vec-desc">${info.desc}</span></td><td></td><td></td><td></td><td></td><td></td>`;
    rows[name] = [...tr.querySelectorAll("td")].slice(1);
    tableBody.append(tr);
  }

  const view = crisp(root.querySelector("#lab-scene"), (ctx, w, h) => {
    if (!prep) return;
    const group = motion.group(t);
    const shown = mode === "alt" ? group : mode;
    const vectors = shown === "vel" ? VELOCITIES : ACCELERATIONS;
    const faded = frame === "carousel" ? vectors.filter((n) => !n.endsWith("rel")) : [];
    drawScene(ctx, w, h, prep, t, { frame, vectors, faded, labels: w > 300 });
    badge.textContent = shown === "vel" ? "VELOCIDADES" : "ACELERAÇÕES";
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
    out.tf.textContent = fmt(motion.tf, 3) + (motion.arrived ? "" : " (não chega)");
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
    timeLabel.textContent = `${fmt(t, 2)} s de ${fmt(motion.tf, 2)} s`;
    slider.value = String(Math.round((t / motion.tf) * 1000));
    setFill(slider);
  }

  function renderLaws(entry) {
    laws.replaceChildren();
    const add = (latex, cls = "law") => {
      const div = document.createElement("div");
      div.className = cls;
      tex(div, latex);
      laws.append(div);
    };
    const m = motion;
    const omega = entry ? entry.latex.omega : toLatex(m.omegaTree);
    const v = entry ? entry.latex.v : toLatex(m.vTree);
    add(`\\omega(t) = ${omega}\\ \\mathrm{rad/s}`);
    add(`v(t) = ${v}\\ \\mathrm{m/s}`);
    if (entry?.latex.r) {
      add(`r(t) = ${entry.latex.r}\\ \\mathrm{m}`);
      add(`\\varphi(t) = ${entry.latex.phi}\\ \\mathrm{rad}`);
    } else {
      add(`r(t) = R - \\textstyle\\int_0^t v\\,d\\tau`);
      add(`\\varphi(t) = \\varphi_0 + \\textstyle\\int_0^t \\omega\\,d\\tau`);
    }
    add(`t_f = ${fmtSig(m.tf, 5).replace(",", "{,}").replace("−", "-")}\\ \\mathrm{s}`);
    const small = document.createElement("p");
    small.className = "law-note";
    small.textContent = entry ? "Leis exatas deduzidas pelo sympy no relatório." : "Integração numérica no navegador (sem forma fechada).";
    laws.append(small);
  }

  function apply(params, entry) {
    try {
      motion = createMotion(params);
    } catch (problem) {
      error.textContent = problem.message;
      for (const input of form.elements) input.setAttribute("aria-invalid", String(problem.message.includes(labelOf(input.name))));
      return false;
    }
    error.textContent = "";
    for (const input of form.elements) input.setAttribute("aria-invalid", "false");
    prep = prepare(motion);
    t = 0;
    const s = motion.scales;
    scaleNote.textContent = `seta de 1 R ≙ ${fmtSig(motion.R / s.vel, 3)} m/s\nseta de 1 R ≙ ${fmtSig(motion.R / s.acc, 3)} m/s²`;
    renderLaws(entry);
    view.redraw();
    for (const listener of listeners) listener();
    return true;
  }

  const labelOf = (name) => ({ omega: "ω", v: "v(t)", R: "R ", phi0: "φ₀", dt: "Δt" })[name];

  function fill(params) {
    form.elements.omega.value = params.omega;
    form.elements.v.value = params.v;
    form.elements.R.value = String(params.R);
    form.elements.phi0.value = params.phi0;
    form.elements.dt.value = String(params.dt);
  }

  function selectCase(key) {
    const entry = report.casos.find((c) => String(c.numero) === key);
    caseKey = key;
    markChip(key);
    note.innerHTML = CASE_NOTES[key];
    fill(entry.params);
    apply({ ...entry.params }, entry);
    setPlaying(!reducedMotion() && visible);
  }

  function selectCustom() {
    caseKey = "custom";
    markChip("custom");
    note.innerHTML = CASE_NOTES.custom;
    form.elements.omega.focus();
    form.elements.omega.select();
  }

  let debounce = 0;
  form.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const params = {
        omega: form.elements.omega.value,
        v: form.elements.v.value,
        R: parseNumber(form.elements.R.value),
        phi0: parseNumber(form.elements.phi0.value),
        dt: parseNumber(form.elements.dt.value),
      };
      const preset = report.casos.find((c) => c.params.omega === params.omega && c.params.v === params.v
        && Number(c.params.R) === Number(params.R) && c.params.phi0 === params.phi0 && c.params.dt === Number(params.dt));
      if (apply(params, preset)) {
        caseKey = preset ? String(preset.numero) : "custom";
        markChip(caseKey);
        note.innerHTML = CASE_NOTES[caseKey];
        setPlaying(!reducedMotion());
      }
    }, 280);
  });
  form.addEventListener("submit", (event) => event.preventDefault());

  // ---- transport
  function setPlaying(on) {
    playing = on;
    playButton.textContent = on ? "Pausar" : t >= motion.tf ? "Repetir" : "Reproduzir";
    playButton.setAttribute("aria-label", playButton.textContent);
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
  segmented(root.querySelector("[data-lab-speed]"), (value) => (speed = Number(value)));
  segmented(root.querySelector("[data-lab-frame]"), (value) => {
    frame = value;
    frameNote.innerHTML = FRAME_NOTES[value];
    view.redraw();
  });
  segmented(root.querySelector("[data-lab-vectors]"), (value) => {
    mode = value;
    view.redraw();
  });
  frameNote.innerHTML = FRAME_NOTES.ground;

  whenVisible(root.querySelector("#lab-scene"), (on) => {
    const first = on && !visible && previous === 0 && t === 0;
    visible = on;
    if (on && (playing || first) && !reducedMotion()) setPlaying(true);
  });

  selectCase("1");

  return {
    current: () => ({ motion, caseKey }),
    onChange: (listener) => listeners.push(listener),
  };
}
