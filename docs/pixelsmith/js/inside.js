// "Inside a block": one 8x8 block through the codec, step by step, and the 64 DCT patterns.

import { run } from "./engine.js";
import { fitCanvas, onThemeChange, paintImage, paintRange, segmented, theme } from "./ui.js";

const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57,
  50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];

export function createInside(root, getImage) {
  const imageCanvas = root.querySelector("[data-inside-image]");
  const qualityInput = root.querySelector("[data-inside-quality]");
  const qualityOut = root.querySelector("[data-inside-quality-out]");
  const grids = Object.fromEntries([...root.querySelectorAll("[data-grid]")].map((c) => [c.dataset.grid, c]));
  const zigzagCanvas = root.querySelector("[data-zigzag]");
  const symbolsText = root.querySelector("[data-symbols]");
  const basisCanvas = root.querySelector("[data-basis]");
  const basisResult = root.querySelector("[data-basis-result]");
  const basisCount = root.querySelector("[data-basis-count]");

  let small = null; // the working image, at most 512 px wide (RGBA)
  let luma = null;
  let block = { x: 20, y: 14 };
  let locked = false;
  let trace = null;
  let codeLengths = null;
  let tablesFor = "";
  const mask = new Uint8Array(64).fill(1);

  // ---------------------------------------------------------------- source image

  async function load(image) {
    if (!image) return;
    let source = image;
    if (image.width > 512) {
      const height = Math.max(8, Math.round((image.height * 512) / image.width));
      source = (await run("resize", { image, width: 512, height, filter: 3 })).result;
    }
    small = source;
    tablesFor = "";
    luma = new Uint8Array(source.width * source.height);
    for (let i = 0; i < luma.length; i++) {
      const d = source.data;
      luma[i] = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
    }
    const bx = Math.floor(source.width / 8), by = Math.floor(source.height / 8);
    if (!locked) block = busiestBlock(bx, by, source.width);
    block = { x: Math.min(block.x, bx - 1), y: Math.min(block.y, by - 1) };
    drawSource();
    analyze();
    renderBasisResult();
  }

  // A block with plenty of detail (high variance) near the middle makes the best first example.
  function busiestBlock(bx, by, width) {
    let best = { x: 0, y: 0 }, bestScore = -1;
    for (let y = 0; y < by; y++)
      for (let x = 0; x < bx; x++) {
        let sum = 0, sum2 = 0;
        for (let r = 0; r < 8; r++)
          for (let c = 0; c < 8; c++) {
            const v = luma[(y * 8 + r) * width + x * 8 + c];
            sum += v;
            sum2 += v * v;
          }
        const variance = sum2 / 64 - (sum / 64) ** 2;
        const centered = 1 - Math.hypot(x / bx - 0.5, y / by - 0.5);
        const score = Math.min(variance, 900) * centered;
        if (score > bestScore) {
          bestScore = score;
          best = { x, y };
        }
      }
    return best;
  }

  function drawSource() {
    if (!small) return;
    const t = theme();
    const w = small.width, h = small.height;
    imageCanvas.width = w * 2;
    imageCanvas.height = h * 2;
    const ctx = imageCanvas.getContext("2d");
    const data = new ImageData(w, h);
    for (let i = 0; i < luma.length; i++) {
      data.data[i * 4] = data.data[i * 4 + 1] = data.data[i * 4 + 2] = luma[i];
      data.data[i * 4 + 3] = 255;
    }
    const tmp = new OffscreenCanvas(w, h);
    tmp.getContext("2d").putImageData(data, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, w * 2, h * 2);
    ctx.strokeStyle = t.dark ? "rgba(0,0,0,0.28)" : "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 16; x < w * 2; x += 16) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h * 2);
    }
    for (let y = 16; y < h * 2; y += 16) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w * 2, y + 0.5);
    }
    ctx.stroke();
    ctx.strokeStyle = t.spark;
    ctx.lineWidth = 3;
    ctx.strokeRect(block.x * 16 - 1.5, block.y * 16 - 1.5, 19, 19);
    if (locked) {
      ctx.fillStyle = t.spark;
      ctx.fillRect(block.x * 16 + 13, block.y * 16 - 6, 6, 6);
    }
  }

  function blockFromEvent(event) {
    const r = imageCanvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - r.left) / r.width) * (small.width / 8));
    const y = Math.floor(((event.clientY - r.top) / r.height) * (small.height / 8));
    return { x: Math.max(0, Math.min(Math.floor(small.width / 8) - 1, x)), y: Math.max(0, Math.min(Math.floor(small.height / 8) - 1, y)) };
  }

  imageCanvas.addEventListener("pointermove", (event) => {
    if (!small || locked || event.pointerType === "touch") return;
    const b = blockFromEvent(event);
    if (b.x !== block.x || b.y !== block.y) {
      block = b;
      drawSource();
      analyze();
    }
  });
  imageCanvas.addEventListener("click", (event) => {
    if (!small) return;
    const b = blockFromEvent(event);
    locked = event.pointerType === "touch" || !(locked && b.x === block.x && b.y === block.y);
    block = b;
    drawSource();
    analyze();
  });

  qualityInput.addEventListener("input", () => {
    paintRange(qualityInput);
    qualityOut.textContent = qualityInput.value;
    analyze();
  });
  paintRange(qualityInput);

  // ---------------------------------------------------------------- one block

  let pending = false, again = false;
  async function analyze() {
    if (!luma) return;
    if (pending) {
      again = true;
      return;
    }
    pending = true;
    do {
      again = false;
      const pixels = new Uint8Array(64);
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) pixels[r * 8 + c] = luma[(block.y * 8 + r) * small.width + block.x * 8 + c];
      const quality = Number(qualityInput.value);
      trace = (await run("block", { pixels, quality })).result;
      const key = `${quality}:${small.width}x${small.height}:${luma.length}`;
      if (key !== tablesFor) {
        const encoded = (await run("encode", { image: small, format: "pxs", quality, gray: 1 })).result;
        codeLengths = (await run("inspect", { bytes: encoded.bytes })).result.lengths;
        tablesFor = key;
      }
    } while (again);
    pending = false;
    drawGrids();
  }

  function cellText(ctx, text, x, y, size, color) {
    ctx.fillStyle = color;
    ctx.fillText(text, x + size / 2, y + size / 2 + 0.5);
  }

  // value -> color: gray for pixels, diverging (Cb blue / accent) for coefficients
  function drawGrid(canvas, values, kind) {
    const { ctx, width } = fitCanvas(canvas, canvas.clientWidth);
    const t = theme();
    const size = width / 8;
    const showNumbers = size >= 26;
    ctx.clearRect(0, 0, width, width);
    ctx.font = `500 ${Math.min(12, size * 0.34)}px ${t.mono}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const max = kind === "coefficients" ? Math.max(1, ...values.map(Math.abs)) : kind === "quantized" ? Math.max(1, ...values.map(Math.abs)) : 1;
    for (let i = 0; i < 64; i++) {
      const x = (i % 8) * size, y = Math.floor(i / 8) * size, v = values[i];
      let fill, ink;
      if (kind === "pixels" || kind === "reconstructed") {
        const g = Math.round(kind === "pixels" ? v + 128 : v);
        fill = `rgb(${g},${g},${g})`;
        ink = g > 140 ? "#1a140e" : "#f3ead8";
      } else {
        const a = Math.sqrt(Math.abs(v) / max);
        if (v === 0 || Math.abs(v) < 0.5) {
          fill = t.surface2;
          ink = t.ink3;
        } else {
          fill = v > 0 ? t.accent : t.cb;
          ctx.globalAlpha = 1;
          ctx.fillStyle = t.surface2;
          ctx.fillRect(x, y, size, size);
          ctx.globalAlpha = 0.25 + 0.75 * a;
          ink = t.dark ? "#fff" : a > 0.5 ? "#fff" : t.ink;
        }
      }
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, size - 1, size - 1);
      ctx.globalAlpha = 1;
      if (showNumbers) {
        const text = kind === "reconstructed" ? String(Math.round(v)) : kind === "coefficients" ? String(Math.round(v)) : String(v);
        cellText(ctx, text, x, y, size, ink);
      }
    }
    if (kind === "quantized") {
      // The zigzag path, up to the last nonzero coefficient.
      let last = 0;
      for (let i = 0; i < 64; i++) if (values[ZIGZAG[i]] !== 0) last = i;
      ctx.strokeStyle = t.spark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= Math.max(last, 1); i++) {
        const z = ZIGZAG[i];
        const cx = (z % 8) * size + size / 2, cy = Math.floor(z / 8) * size + size / 2;
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
  }

  function drawZigzag() {
    const { ctx, width, height } = fitCanvas(zigzagCanvas, 64);
    const t = theme();
    const size = width / 64;
    ctx.clearRect(0, 0, width, height);
    const values = trace.zigzag;
    let last = 0;
    for (let i = 0; i < 64; i++) if (values[i] !== 0) last = i;
    const max = Math.max(1, ...values.map(Math.abs));
    // After the last nonzero value nothing is stored: one end-of-block symbol covers it.
    if (last < 63) {
      ctx.fillStyle = t.dark ? "rgba(255,176,0,0.08)" : "rgba(168,107,0,0.1)";
      ctx.fillRect((last + 1) * size, 0, (63 - last) * size, height - 12);
      ctx.fillStyle = t.spark;
      ctx.font = `400 9px ${t.mark}`;
      ctx.textBaseline = "top";
      ctx.fillText("EOB", (last + 1) * size + 4, 2);
    }
    for (let i = 0; i < 64; i++) {
      const v = values[i];
      const h = v === 0 ? 2 : Math.max(4, (Math.sqrt(Math.abs(v) / max) * (height - 16)) / 2);
      ctx.fillStyle = i > last ? t.line : v === 0 ? t.ink3 : v > 0 ? t.accent : t.cb;
      const mid = (height - 10) / 2;
      if (v >= 0) ctx.fillRect(i * size + 1, mid - h, Math.max(1, size - 2), h);
      else ctx.fillRect(i * size + 1, mid, Math.max(1, size - 2), h);
    }
    ctx.fillStyle = t.ink3;
    ctx.font = `400 9px ${t.mark}`;
    ctx.textBaseline = "bottom";
    ctx.fillText("DC", 0, height);
    ctx.textAlign = "right";
    ctx.fillText("HIGHEST FREQUENCY", width, height);
    ctx.textAlign = "left";
  }

  function describe() {
    const z = trace.zigzag;
    const nonzero = z.filter((v) => v !== 0).length;
    const parts = [`<b>DC ${z[0]}</b>`];
    for (const s of trace.symbols) {
      if (s.run === 0 && s.size === 0) parts.push('<span class="eob">EOB</span>');
      else if (s.run === 15 && s.size === 0) parts.push("16 zeros");
      else parts.push(`${s.run ? `${s.run}×0, ` : ""}<b>${s.value}</b>`);
    }
    // Cost with the Huffman tables PXS builds for this image at this quality (DC counted as if the
    // previous block's DC were 0, so it is an upper estimate).
    const size = (v) => (v === 0 ? 0 : Math.floor(Math.log2(Math.abs(v))) + 1);
    let bits = null;
    if (codeLengths) {
      const dc = size(z[0]);
      bits = (codeLengths[0][dc] || 0) + dc;
      for (const s of trace.symbols) bits += (codeLengths[1][(s.run << 4) | s.size] || 16) + s.size;
    }
    const cost = bits == null ? "" : ` · <b>${bits}</b> bits with this image's Huffman tables, instead of 512`;
    symbolsText.innerHTML = `${parts.join(" · ")}<br><b>${nonzero}</b> of 64 values survive${cost}.`;
  }

  function drawGrids() {
    if (!trace) return;
    drawGrid(grids.pixels, trace.pixels, "pixels");
    drawGrid(grids.coefficients, trace.coefficients, "coefficients");
    drawGrid(grids.quantized, trace.quantized, "quantized");
    drawGrid(grids.reconstructed, trace.reconstructed, "reconstructed");
    drawZigzag();
    describe();
  }

  // ---------------------------------------------------------------- the 64 patterns

  const basis = [];
  for (let k = 0; k < 8; k++) {
    const norm = k === 0 ? Math.sqrt(1 / 8) : Math.sqrt(2 / 8);
    basis.push(Array.from({ length: 8 }, (_, n) => norm * Math.cos(((2 * n + 1) * k * Math.PI) / 16)));
  }

  function drawBasis() {
    const t = theme();
    const cell = 8, gap = 2, unit = cell * 3;
    const size = 8 * unit + 7 * gap;
    basisCanvas.width = size;
    basisCanvas.height = size;
    const ctx = basisCanvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    for (let u = 0; u < 8; u++)
      for (let v = 0; v < 8; v++) {
        const ox = v * (unit + gap), oy = u * (unit + gap);
        const on = mask[u * 8 + v];
        for (let r = 0; r < 8; r++)
          for (let c = 0; c < 8; c++) {
            const value = basis[u][r] * basis[v][c] * 8; // -1..1
            const g = Math.round(128 + value * 127);
            ctx.fillStyle = on ? `rgb(${g},${g},${g})` : t.surface2;
            ctx.fillRect(ox + c * 3, oy + r * 3, 3, 3);
          }
        if (!on) {
          ctx.strokeStyle = t.line;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(ox + 4, oy + 4);
          ctx.lineTo(ox + unit - 4, oy + unit - 4);
          ctx.stroke();
        }
      }
    const count = mask.reduce((a, b) => a + b, 0);
    basisCount.textContent = `${count} of 64 patterns on`;
  }

  basisCanvas.addEventListener("click", (event) => {
    const r = basisCanvas.getBoundingClientRect();
    const v = Math.min(7, Math.floor(((event.clientX - r.left) / r.width) * 8));
    const u = Math.min(7, Math.floor(((event.clientY - r.top) / r.height) * 8));
    mask[u * 8 + v] ^= 1;
    preset.set(null, false);
    drawBasis();
    renderBasisResult();
  });

  const preset = segmented(root.querySelector("[data-basis-preset]"), (value) => {
    for (let i = 0; i < 64; i++) {
      const rank = ZIGZAG.indexOf(i);
      mask[i] = value === "all" ? 1 : value === "dc" ? (i === 0 ? 1 : 0) : value === "low" ? (rank < 10 ? 1 : 0) : i === 0 ? 0 : 1;
    }
    drawBasis();
    renderBasisResult();
  });

  let basisBusy = false, basisAgain = false;
  async function renderBasisResult() {
    if (!small) return;
    if (basisBusy) {
      basisAgain = true;
      return;
    }
    basisBusy = true;
    do {
      basisAgain = false;
      let { result } = await run("dctMask", { image: small, mask });
      // Detail-only images are centered on gray: lift them so they are visible.
      if (!mask[0]) result = (await run("effect", { image: result, kind: 4, value: 0.5 })).result;
      paintImage(basisResult, result);
    } while (basisAgain);
    basisBusy = false;
  }

  drawBasis();
  onThemeChange(() => {
    drawBasis();
    drawSource();
    drawGrids();
  });
  new ResizeObserver(() => drawGrids()).observe(root.querySelector(".steps-grid"));

  return { load };
}
