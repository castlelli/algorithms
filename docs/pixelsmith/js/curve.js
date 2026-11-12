// Quality curve: file size (bits per pixel) against error (PSNR) for PXS 4:2:0, PXS 4:4:4 and JPEG,
// measured on the studio image.

import { run } from "./engine.js";
import { fitCanvas, formatBytes, onThemeChange, theme } from "./ui.js";

const QUALITIES = [2, 5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100];
const SERIES = [
  { key: "pxs420", label: "PXS 4:2:0", color: (t) => t.accent },
  { key: "pxs444", label: "PXS 4:4:4", color: (t) => t.spark },
  { key: "jpeg", label: "JPEG (baseline, stb)", color: (t) => t.cb },
];

export function createCurve(root, getImage) {
  const canvas = root.querySelector("[data-curve]");
  const legend = root.querySelector("[data-curve-legend]");
  const readout = root.querySelector("[data-curve-readout]");
  const note = root.querySelector("[data-curve-note]");
  const button = root.querySelector("[data-curve-run]");
  let rows = null, pixels = 1, hover = null, frame = null, busy = false;

  legend.replaceChildren();
  function renderLegend() {
    const t = theme();
    legend.innerHTML = SERIES.map((s) => `<span><i style="background:${s.color(t)}"></i>${s.label}</span>`).join("");
  }
  renderLegend();

  function placeholder(text) {
    const { ctx, width, height } = fitCanvas(canvas);
    const t = theme();
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = t.ink3;
    ctx.font = `500 16px ${t.pixel}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, width / 2, height / 2);
  }
  placeholder("The chart is measured when you scroll here.");

  async function measure() {
    const image = getImage();
    if (!image || busy) return;
    busy = true;
    button.disabled = true;
    note.textContent = "Encoding at 14 qualities in three ways…";
    if (!rows) placeholder("Measuring…");
    let small = image;
    if (image.width * image.height > 512 * 384) {
      const s = Math.sqrt((512 * 384) / (image.width * image.height));
      small = (await run("resize", { image, width: Math.max(8, Math.round(image.width * s)), height: Math.max(8, Math.round(image.height * s)), filter: 3 })).result;
    }
    try {
      const { result, ms } = await run("curve", { image: small, qualities: QUALITIES });
      rows = result;
      pixels = small.width * small.height;
      note.textContent = `Measured on ${small.width} × ${small.height} pixels: 42 encodes and decodes in ${(ms / 1000).toFixed(2)} s of C. Hover the chart to read a point.`;
      hover = rows.findIndex((r) => r.quality === 60);
      draw();
      showReadout();
    } catch (error) {
      note.textContent = error.message;
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  function layout(width, height) {
    const pad = { left: 52, right: 16, top: 16, bottom: 40 };
    let maxX = 0, minY = 99, maxY = 0;
    for (const r of rows)
      for (const s of SERIES) {
        // The axis covers qualities up to 95; quality 100 runs off the right edge (clipped).
        if (r.quality <= 95) maxX = Math.max(maxX, (r[s.key].bytes * 8) / pixels);
        if (Number.isFinite(r[s.key].psnr)) {
          minY = Math.min(minY, r[s.key].psnr);
          maxY = Math.max(maxY, r[s.key].psnr);
        }
      }
    maxX = maxX > 2 ? Math.ceil(maxX) : Math.ceil(maxX * 2) / 2;
    minY = Math.floor(minY / 5) * 5;
    maxY = Math.ceil(maxY / 5) * 5;
    const x = (v) => pad.left + (v / maxX) * (width - pad.left - pad.right);
    const y = (v) => pad.top + (1 - (v - minY) / (maxY - minY || 1)) * (height - pad.top - pad.bottom);
    return { pad, maxX, minY, maxY, x, y };
  }

  function draw() {
    if (!rows) return;
    const { ctx, width, height } = fitCanvas(canvas);
    const t = theme();
    const L = (frame = layout(width, height));
    ctx.clearRect(0, 0, width, height);
    // Grid and axes.
    ctx.font = `500 11px ${t.mono}`;
    ctx.fillStyle = t.ink3;
    ctx.strokeStyle = t.line;
    ctx.lineWidth = 1;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let v = L.minY; v <= L.maxY; v += 5) {
      const yy = Math.round(L.y(v)) + 0.5;
      ctx.beginPath();
      ctx.setLineDash([2, 4]);
      ctx.moveTo(L.pad.left, yy);
      ctx.lineTo(width - L.pad.right, yy);
      ctx.stroke();
      ctx.fillText(`${v}`, L.pad.left - 8, yy);
    }
    ctx.setLineDash([]);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const step = L.maxX > 3 ? 1 : 0.5;
    for (let v = 0; v <= L.maxX + 1e-9; v += step) ctx.fillText(v.toFixed(step < 1 ? 1 : 0), L.x(v), height - L.pad.bottom + 8);
    ctx.font = `400 10px ${t.mark}`;
    ctx.fillText("BITS PER PIXEL  →  (BIGGER FILE)", (L.pad.left + width - L.pad.right) / 2, height - 14);
    ctx.save();
    ctx.translate(12, (L.pad.top + height - L.pad.bottom) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("PSNR dB  (LESS ERROR)  →", 0, 0);
    ctx.restore();
    // Series: lines and square markers, clipped to the plot.
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.pad.left - 6, 0, width - L.pad.left - L.pad.right + 12, height - L.pad.bottom + 6);
    ctx.clip();
    for (const s of SERIES) {
      const color = s.color(t);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      rows.forEach((r, i) => {
        const p = r[s.key];
        if (!Number.isFinite(p.psnr)) return;
        const px = L.x((p.bytes * 8) / pixels), py = L.y(p.psnr);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.fillStyle = color;
      rows.forEach((r, i) => {
        const p = r[s.key];
        if (!Number.isFinite(p.psnr)) return;
        const size = i === hover ? 9 : 5;
        ctx.fillRect(Math.round(L.x((p.bytes * 8) / pixels) - size / 2), Math.round(L.y(p.psnr) - size / 2), size, size);
      });
    }
    ctx.restore();
    if (hover != null) {
      const r = rows[hover];
      const px = L.x((r.pxs420.bytes * 8) / pixels);
      ctx.strokeStyle = t.ink3;
      ctx.setLineDash([1, 3]);
      ctx.beginPath();
      ctx.moveTo(Math.round(px) + 0.5, L.pad.top);
      ctx.lineTo(Math.round(px) + 0.5, height - L.pad.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function showReadout() {
    if (!rows || hover == null) return;
    const r = rows[hover];
    const cells = [["Quality", String(r.quality)]];
    for (const s of SERIES) cells.push([s.label, `${formatBytes(r[s.key].bytes)} · ${r[s.key].psnr.toFixed(1)} dB`]);
    readout.innerHTML = cells.map(([k, v], i) => `<div${i ? ' style="grid-column: 1 / -1"' : ""}><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  }

  canvas.addEventListener("pointermove", (event) => {
    if (!rows || !frame) return;
    const r = canvas.getBoundingClientRect();
    const mx = event.clientX - r.left, my = event.clientY - r.top;
    let best = null, bestD = Infinity;
    rows.forEach((row, i) => {
      for (const s of SERIES) {
        const p = row[s.key];
        const d = Math.hypot(frame.x((p.bytes * 8) / pixels) - mx, frame.y(p.psnr) - my);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    });
    if (best !== hover) {
      hover = best;
      draw();
      showReadout();
    }
  });

  button.addEventListener("click", measure);
  onThemeChange(() => {
    renderLegend();
    draw();
  });
  new ResizeObserver(draw).observe(canvas);
  return { measure };
}
