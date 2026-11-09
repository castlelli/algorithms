// Basins of attraction: precomputed maps you can click to integrate that initial condition live.

import { coefficients, nearestPoint, rk4Step, strobe } from "./model.js";
import { Plot, fmt, hexToRgb, onResize, onThemeChange, pointerPosition, reducedMotion, theme, watchVisibility } from "./ui.js";

const DRAW_SECONDS = 2.6;

const MAPS = {
  E: {
    caseKey: "E",
    about: "Força fraca (A = 0,20 N): cada poço guarda a sua órbita de período 1. A fronteira entre as bacias é lisa, então só partidas vizinhas dela mudam de destino.",
    classes: ["órbita do poço direito", "órbita do poço esquerdo"],
    palette: ["C", "A"],
    pathPeriods: 14,
  },
  A: {
    caseKey: "A",
    about: "No caso A todas as partidas chegam ao mesmo ciclo de período 5. O que muda é o atraso: a cor diz em qual dos cinco pontos do ciclo o bloco está depois de 160 períodos. As cores se entrelaçam em uma fronteira fractal.",
    classes: ["ponto 1", "ponto 2", "ponto 3", "ponto 4", "ponto 5"],
    palette: ["A", "B", "C", "D", "E"],
    pathPeriods: 20,
  },
  A_zoom: {
    caseKey: "A",
    about: "A mesma figura ampliada 13 vezes. A fronteira não fica mais simples: perto dela, mudar a partida no terceiro dígito já troca o destino.",
    classes: ["ponto 1", "ponto 2", "ponto 3", "ponto 4", "ponto 5"],
    palette: ["A", "B", "C", "D", "E"],
    pathPeriods: 20,
  },
  B: {
    caseKey: "B",
    about: "Sem força o bloco para em x = −1 ou x = +1. As duas bacias se enrolam em espiral em torno da origem, separadas pela variedade estável da sela.",
    classes: ["repouso em x = −1", "repouso em x = +1"],
    palette: ["A", "C"],
    pathPeriods: 0,
  },
};

export async function createBasins(report, lab) {
  const root = document.getElementById("bacias");
  const canvas = root.querySelector("#basin");
  const about = root.querySelector("[data-basin-about]");
  const legend = root.querySelector("[data-basin-legend]");
  const out = Object.fromEntries([...root.querySelectorAll("[data-basin-out]")].map((n) => [n.dataset.basinOut, n]));
  const openInLab = root.querySelector("[data-basin-lab]");
  const plot = new Plot(canvas, { xLabel: "x(0) [m]", yLabel: "ẋ(0) [m/s]", margin: { left: 46, right: 12, top: 10, bottom: 34 } });
  const tinted = document.createElement("canvas");

  const labels = {};
  await Promise.all(
    Object.keys(MAPS).map(async (key) => {
      const image = new Image();
      image.src = `data/${report.basins[key].file}`;
      await image.decode();
      const scratch = document.createElement("canvas");
      scratch.width = image.naturalWidth;
      scratch.height = image.naturalHeight;
      const ctx = scratch.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, scratch.width, scratch.height).data;
      const values = new Uint8Array(scratch.width * scratch.height);
      for (let i = 0; i < values.length; i++) values[i] = data[4 * i];
      labels[key] = { values, size: scratch.width };
    }),
  );

  let key = "E";
  let stale = true;
  let shot = null;
  let visible = false;

  const classColor = (index) => theme().cases[MAPS[key].palette[index]];

  function tint() {
    const colors = theme();
    const { values, size } = labels[key];
    tinted.width = tinted.height = size;
    const image = new ImageData(size, size);
    const pixels = new Uint32Array(image.data.buffer);
    const little = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
    const surface = hexToRgb(colors.surface);
    const strength = colors.dark ? 0.46 : 0.38;
    const pack = ([r, g, b]) => (little ? (255 << 24) | (b << 16) | (g << 8) | r : (r << 24) | (g << 16) | (b << 8) | 255);
    const shades = MAPS[key].palette.map((name) => pack(hexToRgb(colors.cases[name]).map((channel, i) => Math.round(surface[i] + (channel - surface[i]) * strength))));
    const none = pack(hexToRgb(colors.grid));
    for (let i = 0; i < values.length; i++) pixels[i] = values[i] < shades.length ? shades[values[i]] : none;
    tinted.getContext("2d").putImageData(image, 0, 0);
    stale = false;
  }

  function draw() {
    const colors = theme();
    const info = report.basins[key];
    plot.setView(...info.window);
    const ctx = plot.begin();
    if (stale) tint();
    const box = plot.inner;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(tinted, box.left, box.top, box.width, box.height);

    plot.clip(() => {
      if (shot) drawShot(ctx, colors);
      info.points.forEach(([x, v], index) => {
        const px = plot.px(x);
        const py = plot.py(v);
        ctx.fillStyle = colors.surface;
        ctx.beginPath();
        ctx.arc(px, py, 8, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = classColor(index);
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, 2 * Math.PI);
        ctx.fill();
        if (info.points.length > 2) {
          ctx.font = `600 15px ${colors.sans}`;
          ctx.fillStyle = colors.ink;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.strokeStyle = colors.surface;
          ctx.lineWidth = 3.5;
          ctx.lineJoin = "round";
          ctx.strokeText(String(index + 1), px + 11, py);
          ctx.fillText(String(index + 1), px + 11, py);
        }
      });
      if (shot) drawHead(ctx, colors);
    });
  }

  // The whole path stays as a faint trace; only the most recent stretch is drawn at full strength.
  function drawShot(ctx, colors) {
    const total = shot.path.length / 2;
    const shown = Math.max(2, Math.floor(shot.progress * total));
    const recent = Math.max(0, shown - Math.max(60, Math.floor(total * 0.12)));
    const stroke = (from, to, style, width) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (let i = from; i < to; i++) {
        if (i === from) ctx.moveTo(plot.px(shot.path[2 * i]), plot.py(shot.path[2 * i + 1]));
        else ctx.lineTo(plot.px(shot.path[2 * i]), plot.py(shot.path[2 * i + 1]));
      }
      ctx.stroke();
    };
    ctx.globalAlpha = 0.4;
    stroke(0, shown, colors.ink, 1.1);
    ctx.globalAlpha = 1;
    stroke(recent, shown, colors.surface, 4.5);
    stroke(recent, shown, colors.ink, 1.8);
    const sx = plot.px(shot.x0);
    const sy = plot.py(shot.v0);
    for (const [style, width] of [[colors.surface, 5], [colors.ink, 2]]) {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(sx - 7, sy);
      ctx.lineTo(sx + 7, sy);
      ctx.moveTo(sx, sy - 7);
      ctx.lineTo(sx, sy + 7);
      ctx.stroke();
    }
  }

  function drawHead(ctx, colors) {
    const total = shot.path.length / 2;
    const shown = Math.max(2, Math.floor(shot.progress * total));
    const hx = plot.px(shot.path[2 * (shown - 1)]);
    const hy = plot.py(shot.path[2 * (shown - 1) + 1]);
    ctx.fillStyle = colors.surface;
    ctx.beginPath();
    ctx.arc(hx, hy, 6, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = colors.ink;
    ctx.beginPath();
    ctx.arc(hx, hy, 4, 0, 2 * Math.PI);
    ctx.fill();
  }

  // Integrates the clicked initial condition exactly as the Python map did and returns its class.
  function classify(x0, v0) {
    const info = report.basins[key];
    const item = report.cases[MAPS[key].caseKey];
    const c = coefficients(item);
    if (key === "B") {
      const state = [x0, v0];
      const h = 0.01;
      const path = [x0, v0];
      for (let k = 0; k < 40000; k++) {
        rk4Step(k * h, state[0], state[1], h, c, state);
        if (k % 4 === 0 && k < 9000) path.push(state[0], state[1]);
      }
      return { index: state[0] > 0 ? 1 : 0, path };
    }
    const spp = report.numbers.map_steps_per_period;
    const section = strobe(c, x0, v0, info.periods, spp);
    const final = nearestPoint(info.points, section[section.length - 2], section[section.length - 1]);
    const period = (2 * Math.PI) / c.w;
    const h = period / spp;
    const state = [x0, v0];
    const path = [x0, v0];
    for (let k = 0; k < MAPS[key].pathPeriods * spp; k++) {
      rk4Step(k * h, state[0], state[1], h, c, state);
      path.push(state[0], state[1]);
    }
    return { index: final.distance < 1e-3 ? final.index : -1, path };
  }

  function pick(event) {
    const [px, py] = pointerPosition(event, canvas);
    if (!plot.contains(px, py)) return;
    const { values, size } = labels[key];
    const [x0w, x1w, v0w, v1w] = report.basins[key].window;
    const column = Math.max(0, Math.min(size - 1, Math.round(((plot.invX(px) - x0w) / (x1w - x0w)) * (size - 1))));
    const row = Math.max(0, Math.min(size - 1, Math.round(((plot.invY(py) - v0w) / (v1w - v0w)) * (size - 1))));
    // Snap to the grid node, so this is the very initial condition the report integrated.
    const x0 = x0w + (column / (size - 1)) * (x1w - x0w);
    const v0 = v0w + (row / (size - 1)) * (v1w - v0w);
    const predicted = values[(size - 1 - row) * size + column];
    const { index, path } = classify(x0, v0);
    const names = MAPS[key].classes;
    shot = { x0, v0, path, progress: reducedMotion() ? 1 : 0, started: performance.now() };
    out.start.textContent = `(${fmt(x0, 4)}; ${fmt(v0, 4)})`;
    out.map.textContent = names[predicted] ?? "sem classe";
    out.live.textContent = names[index] ?? "não convergiu";
    out.check.textContent = predicted === index ? "igual ao relatório" : "diferente: fronteira sensível ao último dígito";
    openInLab.disabled = false;
    draw();
  }

  function select(next) {
    key = next;
    stale = true;
    shot = null;
    about.textContent = MAPS[key].about;
    legend.innerHTML = MAPS[key].classes.map((name, index) => `<li><i style="--swatch: var(--case-${MAPS[key].palette[index].toLowerCase()})"></i>${name}</li>`).join("");
    out.start.textContent = "clique no mapa";
    out.map.textContent = out.live.textContent = out.check.textContent = "–";
    openInLab.disabled = true;
    for (const button of root.querySelectorAll("[data-basin-tabs] button")) button.setAttribute("aria-pressed", String(button.dataset.basin === key));
    draw();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible || !shot || shot.progress >= 1) return;
    shot.progress = Math.min(1, (now - shot.started) / (DRAW_SECONDS * 1000));
    draw();
  }

  canvas.addEventListener("click", pick);
  for (const button of root.querySelectorAll("[data-basin-tabs] button")) button.addEventListener("click", () => select(button.dataset.basin));
  openInLab.addEventListener("click", () => {
    if (!shot) return;
    const item = report.cases[MAPS[key].caseKey];
    lab.load({ params: item, x0: Number(shot.x0.toFixed(4)), v0: Number(shot.v0.toFixed(4)), tmax: Math.round(item.tmax * 10) / 10, scroll: true });
  });
  watchVisibility(root, (value) => (visible = value));
  onResize(canvas, draw);
  onThemeChange(() => {
    stale = true;
    draw();
  });
  document.fonts?.ready.then(draw);
  select("E");
  requestAnimationFrame(frame);
}
