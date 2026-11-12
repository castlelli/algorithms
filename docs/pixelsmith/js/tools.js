// The studio's tools. Each tool turns the working image and its parameters into a result through
// the C engine, and says what to show: stats, palette, histogram, bytes to download.

import { run } from "./engine.js";
import { formatBytes, formatDb, formatMs } from "./ui.js";

// 8x8 pixel icons, one string per row.
function icon(rows) {
  let d = "";
  rows.forEach((row, y) => {
    for (let x = 0; x < 8; x++) if (row[x] === "#") d += `M${x} ${y}h1v1H${x}z`;
  });
  return `<svg viewBox="0 0 8 8" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="${d}"/></svg>`;
}

const ICONS = {
  compress: icon(["#......#", ".#....#.", "..#..#..", "........", "........", "..#..#..", ".#....#.", "#......#"]),
  export: icon(["...##...", "...##...", "...##...", ".######.", "..####..", "...##...", "........", "########"]),
  resize: icon(["####....", "#.......", "#.......", "#..#####", "...#...#", "...#...#", "...#...#", "...#####"]),
  crop: icon([".#......", ".#......", "#######.", ".#....#.", ".#....#.", ".######.", "......#.", "......#."]),
  rotate: icon(["...###..", "..#...#.", "..#...#.", "###...#.", ".#....#.", "......#.", "..####..", "........"]),
  adjust: icon(["..#.....", "########", "..#.....", "........", ".....#..", "########", ".....#..", "........"]),
  effects: icon(["...#....", "...#....", "#######.", "...#....", "...#....", "......#.", ".....###", "......#."]),
  filters: icon(["..####..", ".#..###.", "#...####", "#...####", "#...####", "#...####", ".#..###.", "..####.."]),
  colors: icon(["###..###", "###..###", "###..###", "........", "........", "###..###", "###..###", "###..###"]),
  compare: icon(["########", "#...####", "#...####", "#...####", "#...####", "#...####", "#...####", "########"]),
};

const rawBytes = (image) => image.width * image.height * 3;
const stat = (label, value, extra = {}) => ({ label, value, ...extra });

// ---------------------------------------------------------------- compress

const compress = {
  id: "compress",
  name: "Compress",
  group: "Codec",
  blurb: "The DCT codec at the heart of Pixelsmith. Watch size, error and artifacts trade off; Download saves the compressed file.",
  defaults: () => ({ format: "pxs", quality: 60, chroma: "420" }),
  controls: (p) => [
    {
      type: "segmented",
      key: "format",
      label: "Format",
      options: [
        { value: "pxs", label: "PXS" },
        { value: "jpeg", label: "JPEG" },
        { value: "classic", label: "Classic" },
      ],
    },
    p.format === "classic"
      ? { type: "note", text: "The original text format: gray, a fixed table (quality 50), and the size cut to whole 8×8 blocks. Kept byte-compatible with the first version of the compressor." }
      : { type: "range", key: "quality", label: "Quality", min: 1, max: 100, step: 1 },
    p.format === "pxs"
      ? {
          type: "segmented",
          key: "chroma",
          label: "Color detail",
          options: [
            { value: "420", label: "4:2:0 (smaller)" },
            { value: "444", label: "4:4:4 (sharper)" },
          ],
        }
      : null,
    { type: "note", text: "Open a .pxs or classic .txt file to decompress it: the engine decodes it like any image." },
  ],
  async run(image, p) {
    const { result, ms } = await run("roundtrip", {
      image,
      format: p.format,
      quality: p.format === "classic" ? 50 : p.quality,
      subsampling: p.chroma === "420" ? 1 : 0,
    });
    const size = result.bytes.length;
    const m = result.metrics;
    return {
      image: result.image,
      diff: m.diff,
      bytes: result.bytes,
      format: p.format,
      stats: [
        stat("File size", formatBytes(size)),
        stat("Ratio", `${(rawBytes(image) / size).toFixed(1)} : 1`),
        stat("Bits / pixel", ((size * 8) / (result.image.width * result.image.height)).toFixed(3)),
        stat("PSNR", formatDb(m.psnr), { good: m.psnr > 38 }),
        stat("SSIM", m.ssim.toFixed(4), { good: m.ssim > 0.97 }),
        stat("Time in C", formatMs(ms)),
      ],
    };
  },
  label: (p) => (p.format === "classic" ? "Classic" : `${p.format.toUpperCase()} q${p.quality}`),
};

// ---------------------------------------------------------------- export

const exportTool = {
  id: "export",
  name: "Export",
  group: "Codec",
  blurb: "Convert to another format and see what each one costs. Also the image's facts and histogram.",
  defaults: () => ({ format: "png", quality: 85 }),
  controls: (p) => [
    {
      type: "segmented",
      key: "format",
      label: "Format",
      options: ["png", "jpeg", "pxs", "bmp", "tga"].map((value) => ({ value, label: value.toUpperCase() })),
    },
    p.format === "jpeg" || p.format === "pxs" ? { type: "range", key: "quality", label: "Quality", min: 1, max: 100, step: 1 } : null,
  ],
  async run(image, p) {
    const sizes = {};
    let totalMs = 0;
    for (const format of ["png", "jpeg", "pxs", "bmp"]) {
      const { result, ms } = await run("encode", { image, format, quality: p.quality });
      sizes[format] = result.bytes;
      totalMs += ms;
    }
    let bytes = sizes[p.format];
    if (!bytes) {
      const { result, ms } = await run("encode", { image, format: p.format, quality: p.quality });
      bytes = result.bytes;
      totalMs += ms;
    }
    const { result: histogram } = await run("histogram", { image });
    let opaque = true;
    for (let i = 3; i < image.data.length && opaque; i += 4) opaque = image.data[i] === 255;
    const order = ["png", "jpeg", "pxs", "bmp"];
    return {
      image,
      bytes,
      format: p.format,
      histogram,
      unchanged: true,
      stats: [
        stat("Dimensions", `${image.width} × ${image.height}`),
        stat("Alpha", opaque ? "none (opaque)" : "yes"),
        ...order.map((f) => stat(f === "jpeg" ? `JPEG q${p.quality}` : f === "pxs" ? `PXS q${p.quality}` : f.toUpperCase(), formatBytes(sizes[f].length), { good: f === p.format })),
        stat("Time in C", formatMs(totalMs), { full: true }),
      ],
    };
  },
  label: (p) => `Export ${p.format.toUpperCase()}`,
  applies: false,
};

// ---------------------------------------------------------------- resize

const FILTERS = [
  { value: "0", label: "Nearest" },
  { value: "1", label: "Bilinear" },
  { value: "2", label: "Bicubic" },
  { value: "3", label: "Lanczos" },
];

const resize = {
  id: "resize",
  name: "Resize",
  group: "Geometry",
  blurb: "Scale with a choice of filter. Filtering happens in linear light with premultiplied alpha, so edges stay clean.",
  defaults: (image) => ({ width: Math.round(image.width / 2), height: Math.round(image.height / 2), lock: true, filter: "3" }),
  controls: () => [
    { type: "dimensions", label: "Size in pixels" },
    {
      type: "presets",
      label: "Scale",
      options: [0.25, 0.5, 0.75, 1, 2, 4].map((s) => ({ value: s, label: `${s * 100}%` })),
      apply: (s, p, image) => ({ ...p, width: Math.max(1, Math.round(image.width * s)), height: Math.max(1, Math.round(image.height * s)) }),
    },
    { type: "segmented", key: "filter", label: "Filter", options: FILTERS },
  ],
  async run(image, p) {
    const width = Math.max(1, Math.min(16384, Math.round(p.width)));
    const height = Math.max(1, Math.min(16384, Math.round(p.height)));
    const { result, ms } = await run("resize", { image, width, height, filter: Number(p.filter) });
    return {
      image: result,
      stats: [
        stat("From", `${image.width} × ${image.height}`),
        stat("To", `${width} × ${height}`),
        stat("Scale", `${((width / image.width) * 100).toFixed(1)}%`),
        stat("Time in C", formatMs(ms)),
      ],
    };
  },
  label: (p) => `Resize ${p.width}×${p.height}`,
};

// ---------------------------------------------------------------- crop

const crop = {
  id: "crop",
  name: "Crop",
  group: "Geometry",
  blurb: "Drag on the image to draw the crop, or type exact numbers.",
  defaults: (image) => ({ x: 0, y: 0, width: image.width, height: image.height, aspect: "free" }),
  controls: () => [
    {
      type: "segmented",
      key: "aspect",
      label: "Aspect",
      options: [
        { value: "free", label: "Free" },
        { value: "1", label: "1:1" },
        { value: "1.3333", label: "4:3" },
        { value: "1.5", label: "3:2" },
        { value: "1.7778", label: "16:9" },
      ],
    },
    { type: "crop" },
    { type: "note", text: "Drag on the image to draw a new rectangle." },
  ],
  crops: true,
  async run(image, p) {
    const r = clampCrop(p, image);
    const { result, ms } = await run("crop", { image, ...r });
    return {
      image: result,
      stats: [stat("Kept", `${r.width} × ${r.height}`), stat("Area", `${((100 * r.width * r.height) / (image.width * image.height)).toFixed(1)}%`), stat("Time in C", formatMs(ms))],
    };
  },
  label: (p) => `Crop ${p.width}×${p.height}`,
};

export function clampCrop(p, image) {
  const x = Math.max(0, Math.min(image.width - 1, Math.round(p.x)));
  const y = Math.max(0, Math.min(image.height - 1, Math.round(p.y)));
  const width = Math.max(1, Math.min(image.width - x, Math.round(p.width)));
  const height = Math.max(1, Math.min(image.height - y, Math.round(p.height)));
  return { x, y, width, height };
}

// ---------------------------------------------------------------- rotate

const rotate = {
  id: "rotate",
  name: "Rotate",
  group: "Geometry",
  blurb: "Quarter turns and flips are lossless. Any other angle resamples and grows the canvas, with transparent corners.",
  defaults: () => ({ angle: 0, flipH: false, flipV: false }),
  controls: () => [
    {
      type: "buttons",
      label: "Quick",
      buttons: [
        { label: "↺ 90°", apply: (p) => ({ ...p, angle: normalizeAngle(p.angle - 90) }) },
        { label: "↻ 90°", apply: (p) => ({ ...p, angle: normalizeAngle(p.angle + 90) }) },
        { label: "Flip ↔", apply: (p) => ({ ...p, flipH: !p.flipH }), pressed: (p) => p.flipH },
        { label: "Flip ↕", apply: (p) => ({ ...p, flipV: !p.flipV }), pressed: (p) => p.flipV },
      ],
    },
    { type: "range", key: "angle", label: "Angle", min: -180, max: 180, step: 0.5, unit: "°" },
  ],
  async run(image, p) {
    let current = image, total = 0;
    if (p.angle) {
      const r = await run("rotate", { image: current, degrees: p.angle });
      current = r.result;
      total += r.ms;
    }
    for (const [on, horizontal] of [[p.flipH, true], [p.flipV, false]]) {
      if (!on) continue;
      const r = await run("flip", { image: current, horizontal });
      current = r.result;
      total += r.ms;
    }
    const lossless = p.angle % 90 === 0;
    return {
      image: current,
      stats: [stat("Size", `${current.width} × ${current.height}`), stat("Lossless", lossless ? "yes" : "no, resampled", { good: lossless }), stat("Time in C", formatMs(total))],
    };
  },
  label: (p) => [p.angle ? `Rotate ${p.angle}°` : "", p.flipH ? "Flip ↔" : "", p.flipV ? "Flip ↕" : ""].filter(Boolean).join(", ") || "Rotate 0°",
};

const normalizeAngle = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

// ---------------------------------------------------------------- adjust

const adjust = {
  id: "adjust",
  name: "Adjust",
  group: "Tone",
  blurb: "Six classic adjustments in one pass: a lookup table for tone, a 3×3 color matrix for hue and saturation.",
  defaults: () => ({ brightness: 0, contrast: 0, gamma: 1, saturation: 0, hue: 0, temperature: 0 }),
  controls: () => [
    { type: "range", key: "brightness", label: "Brightness", min: -1, max: 1, step: 0.01, signed: true },
    { type: "range", key: "contrast", label: "Contrast", min: -1, max: 1, step: 0.01, signed: true },
    { type: "range", key: "gamma", label: "Gamma", min: 0.2, max: 3, step: 0.01 },
    { type: "range", key: "saturation", label: "Saturation", min: -1, max: 1, step: 0.01, signed: true },
    { type: "range", key: "hue", label: "Hue", min: -180, max: 180, step: 1, unit: "°", signed: true },
    { type: "range", key: "temperature", label: "Temperature", min: -1, max: 1, step: 0.01, signed: true },
    { type: "reset", label: "Reset all" },
  ],
  async run(image, p) {
    const { result, ms } = await run("adjust", { image, ...p });
    return { image: result, stats: [stat("Time in C", formatMs(ms))] };
  },
  label: () => "Adjust",
};

// ---------------------------------------------------------------- effects

const EFFECTS = {
  grayscale: { kind: 0, label: "Grayscale" },
  invert: { kind: 1, label: "Invert" },
  sepia: { kind: 2, label: "Sepia", value: { label: "Amount", min: 0, max: 1, step: 0.01, default: 1 } },
  threshold: { kind: 3, label: "Threshold", value: { label: "Level", min: 0, max: 255, step: 1, default: 128 } },
  levels: { kind: 4, label: "Auto levels", value: { label: "Clip %", min: 0, max: 5, step: 0.1, default: 0.5 } },
  equalize: { kind: 5, label: "Equalize" },
  posterize: { kind: 6, label: "Posterize", value: { label: "Levels", min: 2, max: 16, step: 1, default: 4 } },
};

const effects = {
  id: "effects",
  name: "Effects",
  group: "Tone",
  blurb: "One-click tone effects. Equalize spreads the luma histogram flat; auto levels stretches each channel.",
  defaults: () => ({ effect: "equalize", value: 0 }),
  controls: (p) => {
    const e = EFFECTS[p.effect];
    return [
      { type: "select", key: "effect", label: "Effect", options: Object.entries(EFFECTS).map(([value, x]) => ({ value, label: x.label })), resets: (value) => ({ value: EFFECTS[value].value?.default ?? 0 }) },
      e.value ? { type: "range", key: "value", ...e.value } : null,
    ];
  },
  async run(image, p) {
    const e = EFFECTS[p.effect];
    const { result, ms } = await run("effect", { image, kind: e.kind, value: p.value });
    return { image: result, stats: [stat("Time in C", formatMs(ms))] };
  },
  label: (p) => EFFECTS[p.effect].label,
};

// ---------------------------------------------------------------- filters

const FILTER_KINDS = {
  blur: { kind: 0, label: "Gaussian blur", a: { label: "Radius σ", min: 0.3, max: 20, step: 0.1, default: 2 } },
  sharpen: { kind: 1, label: "Sharpen", a: { label: "Radius σ", min: 0.3, max: 5, step: 0.1, default: 1 }, b: { label: "Amount", min: 0, max: 4, step: 0.05, default: 1 } },
  edges: { kind: 2, label: "Edges (Sobel)" },
  emboss: { kind: 3, label: "Emboss" },
  median: { kind: 4, label: "Median (denoise)", a: { label: "Radius", min: 1, max: 8, step: 1, default: 1 } },
  pixelate: { kind: 5, label: "Pixelate", a: { label: "Block size", min: 2, max: 64, step: 1, default: 8 } },
};

const filters = {
  id: "filters",
  name: "Filters",
  group: "Tone",
  blurb: "Neighborhood filters. Blur is a separable Gaussian; the median uses a sliding histogram, so big radii stay fast.",
  defaults: () => ({ filter: "sharpen", a: 1, b: 1 }),
  controls: (p) => {
    const f = FILTER_KINDS[p.filter];
    return [
      {
        type: "select",
        key: "filter",
        label: "Filter",
        options: Object.entries(FILTER_KINDS).map(([value, x]) => ({ value, label: x.label })),
        resets: (value) => ({ a: FILTER_KINDS[value].a?.default ?? 0, b: FILTER_KINDS[value].b?.default ?? 0 }),
      },
      f.a ? { type: "range", key: "a", ...f.a } : null,
      f.b ? { type: "range", key: "b", ...f.b } : null,
    ];
  },
  async run(image, p) {
    const f = FILTER_KINDS[p.filter];
    const { result, ms } = await run("filter", { image, kind: f.kind, a: p.a, b: p.b });
    return { image: result, stats: [stat("Time in C", formatMs(ms))] };
  },
  label: (p) => FILTER_KINDS[p.filter].label,
};

// ---------------------------------------------------------------- colors

const colors = {
  id: "colors",
  name: "Colors",
  group: "Tone",
  blurb: "Reduce to a palette with median cut, then map with or without dithering. Retro looks and small PNGs.",
  defaults: () => ({ colors: 16, dither: "1" }),
  controls: () => [
    { type: "range", key: "colors", label: "Colors", min: 2, max: 256, step: 1 },
    {
      type: "segmented",
      key: "dither",
      label: "Dithering",
      options: [
        { value: "0", label: "None" },
        { value: "1", label: "Floyd–Steinberg" },
        { value: "2", label: "Bayer" },
      ],
    },
  ],
  async run(image, p) {
    const { result, ms } = await run("quantize", { image, colors: p.colors, dither: Number(p.dither) });
    const png = await run("encode", { image: result, format: "png" });
    return {
      image: result,
      palette: result.palette,
      stats: [stat("Palette", `${result.palette.length} colors`), stat("As PNG", formatBytes(png.result.bytes.length)), stat("Time in C", formatMs(ms + png.ms), { full: true })],
    };
  },
  label: (p) => `${p.colors} colors`,
};

// ---------------------------------------------------------------- compare

const compare = {
  id: "compare",
  name: "Compare",
  group: "Inspect",
  blurb: "Measure how far the current image is from a reference: PSNR, SSIM and a difference map.",
  defaults: () => ({ against: "original", amplify: 4 }),
  controls: () => [
    {
      type: "segmented",
      key: "against",
      label: "Reference",
      options: [
        { value: "original", label: "Original" },
        { value: "file", label: "Another file…" },
      ],
    },
    { type: "range", key: "amplify", label: "Amplify difference", min: 1, max: 32, step: 1, unit: "×" },
    { type: "note", text: "Compare an image with its original after the steps you applied, or with any other file of the same size." },
  ],
  async run(image, p, ctx) {
    const reference = p.against === "file" ? ctx.compareImage : ctx.source;
    if (!reference) return { image, unchanged: true, message: "Choose a reference file.", stats: [] };
    if (reference.width !== image.width || reference.height !== image.height)
      return {
        image,
        unchanged: true,
        message: `Sizes differ: reference ${reference.width} × ${reference.height}, current ${image.width} × ${image.height}.`,
        stats: [],
      };
    const { result, ms } = await run("compare", { a: reference, b: image, amplify: p.amplify });
    return {
      image,
      before: reference,
      diff: result.diff,
      unchanged: true,
      stats: [
        stat("PSNR", formatDb(result.psnr), { good: result.psnr > 38 }),
        stat("SSIM", result.ssim.toFixed(4), { good: result.ssim > 0.97 }),
        stat("MSE", result.mse.toFixed(3)),
        stat("Time in C", formatMs(ms)),
      ],
    };
  },
  label: () => "Compare",
  applies: false,
};

export const TOOLS = [compress, exportTool, resize, crop, rotate, adjust, effects, filters, colors, compare];
export const TOOL_ICONS = ICONS;
export const toolById = (id) => TOOLS.find((t) => t.id === id);
