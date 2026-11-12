// The hero: a photo recompressed by the C codec at a cycle of qualities. Each change sweeps across
// the image block by block; freshly re-encoded blocks flash with a spark outline.

import { run } from "./engine.js";
import { decodeUrl } from "./load.js";
import { formatBytes, reducedMotion, theme } from "./ui.js";

const QUALITIES = [3, 8, 18, 40, 75, 95];

export async function createHero(canvas, { onReady } = {}) {
  const ctx = canvas.getContext("2d");
  const readouts = Object.fromEntries([...document.querySelectorAll("[data-hero]")].map((n) => [n.dataset.hero, n]));
  const { image } = await decodeUrl("samples/parrots.png", "parrots.png");
  const { width, height } = image;
  canvas.width = width;
  canvas.height = height;

  // Encode and decode every quality once, in C.
  const levels = [];
  for (const quality of QUALITIES) {
    const { result } = await run("roundtrip", { image, format: "pxs", quality, subsampling: 1 });
    levels.push({ quality, image: result.image, bytes: result.bytes.length, psnr: result.metrics.psnr });
  }
  onReady?.();

  const shown = new ImageData(new Uint8ClampedArray(levels[0].image.data), width, height);
  ctx.putImageData(shown, 0, 0);
  const bx = Math.ceil(width / 8), by = Math.ceil(height / 8);

  function setReadout(level) {
    readouts.quality.textContent = String(level.quality);
    readouts.q.textContent = String(level.quality);
    readouts.size.textContent = formatBytes(level.bytes);
    readouts.ratio.textContent = `${((width * height * 3) / level.bytes).toFixed(0)} : 1`;
    readouts.psnr.textContent = `${level.psnr.toFixed(1)} dB`;
  }
  setReadout(levels[0]);

  if (reducedMotion()) {
    const level = levels[3];
    ctx.putImageData(new ImageData(new Uint8ClampedArray(level.image.data), width, height), 0, 0);
    setReadout(level);
    return;
  }

  // Order of blocks for a sweep: a diagonal front with a little noise.
  const order = [];
  for (let y = 0; y < by; y++) for (let x = 0; x < bx; x++) order.push({ x, y, t: (x + y) / (bx + by) + Math.random() * 0.12 });
  order.sort((a, b) => a.t - b.t);

  let index = 0, direction = 1, cursor = 0, from = levels[0], to = levels[1];
  let phase = "hold", phaseStart = performance.now(), visible = true, raf = 0;
  const SWEEP = 1300, HOLD = 1500;
  const sparks = [];

  function copyBlock(block, source) {
    const x0 = block.x * 8, y0 = block.y * 8;
    const x1 = Math.min(width, x0 + 8), y1 = Math.min(height, y0 + 8);
    for (let y = y0; y < y1; y++) {
      const start = (y * width + x0) * 4;
      shown.data.set(source.data.subarray(start, start + (x1 - x0) * 4), start);
    }
  }

  function tick(now) {
    raf = 0;
    if (!visible) return;
    if (phase === "hold" && now - phaseStart > HOLD) {
      phase = "sweep";
      phaseStart = now;
      cursor = 0;
      if (index + direction < 0 || index + direction >= levels.length) direction = -direction;
      from = levels[index];
      to = levels[index + direction];
      index += direction;
    }
    if (phase === "sweep") {
      const progress = Math.min(1, (now - phaseStart) / SWEEP);
      const target = Math.floor(progress * order.length);
      while (cursor < target) {
        const block = order[cursor++];
        copyBlock(block, to.image);
        if (Math.random() < 0.06) sparks.push({ x: block.x, y: block.y, born: now });
      }
      if (progress >= 1) {
        phase = "hold";
        phaseStart = now;
        setReadout(to);
      } else if (cursor % 4 === 0) {
        readouts.quality.textContent = String(Math.round(from.quality + (to.quality - from.quality) * progress));
      }
    }
    ctx.putImageData(shown, 0, 0);
    const t = theme();
    for (let i = sparks.length - 1; i >= 0; i--) {
      const age = (now - sparks[i].born) / 420;
      if (age >= 1) {
        sparks.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = 1 - age;
      ctx.strokeStyle = age < 0.5 ? t.spark : t.accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(sparks[i].x * 8 + 0.5, sparks[i].y * 8 + 0.5, 7, 7);
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(tick);
  }

  const resume = () => {
    if (visible && !document.hidden && !raf) raf = requestAnimationFrame(tick);
  };
  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    resume();
  }).observe(canvas);
  document.addEventListener("visibilitychange", resume);
  resume();
}
