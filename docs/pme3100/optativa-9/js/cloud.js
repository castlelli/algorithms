// A cloud of independent trajectories advanced together and drawn as a density image.
// Sampled at a fixed forcing phase it is the stroboscopic (Poincare) section of the attractor.

import { advanceCloud, coefficients, STEPS_PER_PERIOD } from "./model.js";
import { Plot, fitCanvas, hexToRgb, onResize, onThemeChange, theme, watchVisibility } from "./ui.js";

const VIEW = [-1.7, 1.7, -1.25, 1.25];

export function createCloud(canvas, options) {
  const { seed, axes = false, stepsPerFrame = 2 } = options;
  const count = seed.length / 2;
  const xs = new Float64Array(count);
  const vs = new Float64Array(count);
  const plot = axes ? new Plot(canvas, { xLabel: "x [m]", yLabel: "ẋ [m/s]", margin: { left: 44, right: 12, top: 10, bottom: 32 } }) : null;
  const buffer = document.createElement("canvas");
  const listeners = [];

  let params = options.params;
  let color = options.color;
  let c = coefficients(params);
  let h = (2 * Math.PI) / params.omega / STEPS_PER_PERIOD;
  let k = 0;
  let playing = options.autoplay ?? false;
  let target = null;
  let visible = false;
  let counts = null;
  let image = null;
  let lut = null;
  let dirty = true;

  function reseed(points) {
    for (let i = 0; i < count; i++) {
      xs[i] = points ? points[2 * i] : VIEW[0] + Math.random() * (VIEW[1] - VIEW[0]);
      vs[i] = points ? points[2 * i + 1] : VIEW[2] + Math.random() * (VIEW[3] - VIEW[2]);
    }
    k = 0;
    dirty = true;
  }

  function buildLut() {
    const colors = theme();
    const [r, g, b] = hexToRgb(color());
    const [hr, hg, hb] = colors.dark ? [255, 244, 232] : hexToRgb(colors.ink);
    lut = new Uint32Array(256);
    const view = new DataView(lut.buffer);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      const mix = t ** 2.4 * (colors.dark ? 0.92 : 0.8);
      view.setUint8(4 * i, Math.round(r + (hr - r) * mix));
      view.setUint8(4 * i + 1, Math.round(g + (hg - g) * mix));
      view.setUint8(4 * i + 2, Math.round(b + (hb - b) * mix));
      view.setUint8(4 * i + 3, Math.round(255 * Math.min(1, 0.22 + t * 1.5)));
    }
  }

  function render() {
    let ctx;
    let box;
    if (plot) {
      plot.setView(...VIEW);
      ctx = plot.begin();
      plot.zeroLines();
      box = plot.inner;
    } else {
      const fitted = fitCanvas(canvas);
      ctx = fitted.ctx;
      ctx.clearRect(0, 0, fitted.width, fitted.height);
      box = { left: 0, top: 0, width: fitted.width, height: fitted.height };
    }
    const scale = Math.min(1.5, window.devicePixelRatio || 1);
    const w = Math.max(2, Math.round(box.width * scale));
    const hgt = Math.max(2, Math.round(box.height * scale));
    if (buffer.width !== w || buffer.height !== hgt) {
      buffer.width = w;
      buffer.height = hgt;
      counts = new Uint16Array(w * hgt);
      image = new ImageData(w, hgt);
    }
    if (!lut) buildLut();
    counts.fill(0);
    const sx = w / (VIEW[1] - VIEW[0]);
    const sy = hgt / (VIEW[3] - VIEW[2]);
    for (let i = 0; i < count; i++) {
      const px = ((xs[i] - VIEW[0]) * sx) | 0;
      const py = ((VIEW[3] - vs[i]) * sy) | 0;
      if (px < 0 || py < 0 || px >= w - 1 || py >= hgt - 1) continue;
      const at = py * w + px;
      counts[at] += 3;
      counts[at + 1]++;
      counts[at + w]++;
      if (px > 0) counts[at - 1]++;
      if (py > 0) counts[at - w]++;
    }
    const pixels = new Uint32Array(image.data.buffer);
    const gain = 20 * Math.max(0.5, (w * hgt) / 500000);
    for (let i = 0; i < pixels.length; i++) {
      const n = counts[i];
      pixels[i] = n === 0 ? 0 : lut[Math.min(255, (n * gain) | 0)];
    }
    buffer.getContext("2d").putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(buffer, box.left, box.top, box.width, box.height);
    dirty = false;
  }

  function notify() {
    const phase = ((k % STEPS_PER_PERIOD) + STEPS_PER_PERIOD) % STEPS_PER_PERIOD;
    for (const listener of listeners) listener(phase);
  }

  function frame() {
    requestAnimationFrame(frame);
    if (!visible) return;
    let steps = 0;
    if (playing) steps = stepsPerFrame;
    else if (target !== null) {
      const remaining = (target - (k % STEPS_PER_PERIOD) + STEPS_PER_PERIOD) % STEPS_PER_PERIOD;
      steps = Math.min(remaining, 12);
      if (remaining === 0) target = null;
    }
    if (steps > 0) {
      advanceCloud(xs, vs, k, steps, h, c);
      k += steps;
      dirty = true;
      notify();
    }
    if (dirty) render();
  }

  reseed(seed);
  watchVisibility(canvas, (value) => {
    visible = value;
    dirty = true;
  });
  onResize(canvas, () => (dirty = true));
  onThemeChange(() => {
    lut = null;
    dirty = true;
  });
  document.fonts?.ready.then(() => (dirty = true));
  requestAnimationFrame(frame);

  return {
    setPlaying(value) {
      playing = value;
      target = null;
    },
    isPlaying: () => playing,
    seekPhase(index) {
      playing = false;
      target = index;
    },
    onPhase(listener) {
      listeners.push(listener);
    },
    // Switches the equation; with no points the cloud restarts scattered over the whole window.
    setSystem(nextParams, points) {
      params = nextParams;
      c = coefficients(params);
      h = (2 * Math.PI) / params.omega / STEPS_PER_PERIOD;
      lut = null;
      reseed(points);
      notify();
    },
  };
}
