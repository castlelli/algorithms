// Runs the C engine (compiled to WebAssembly) off the main thread.
// Messages: { id, op, args } -> { id, ok, result, ms } where ms is the time spent inside C.

import createEngine from "../engine/pixelsmith.js";

const FORMATS = { png: 1, jpeg: 2, bmp: 3, tga: 4, pxs: 5, classic: 6 };

let M;
const ready = createEngine({
  locateFile: (path) => new URL(`../engine/${path}`, import.meta.url).href,
}).then((module) => {
  M = module;
});

// ---------------------------------------------------------------- memory helpers

function copyIn(bytes) {
  const pointer = M._malloc(Math.max(1, bytes.length));
  if (!pointer) throw new Error("out of memory");
  M.HEAPU8.set(bytes, pointer);
  return pointer;
}

function text(pointer) {
  let end = pointer;
  while (M.HEAPU8[end]) end++;
  return new TextDecoder().decode(M.HEAPU8.subarray(pointer, end));
}

// Reads a ps_wasm_result (layout fixed in src/wasm.c) and frees it.
function take(r) {
  if (!r) throw new Error("out of memory");
  const i32 = (offset) => M.HEAP32[(r + offset) >> 2];
  const status = i32(0);
  const out = {
    status,
    width: i32(4),
    height: i32(8),
    channels: i32(12),
    data: null,
    extra: null,
    values: Array.from(M.HEAPF64.subarray((r + 40) >> 3, ((r + 40) >> 3) + 16)),
  };
  const data = M.HEAPU32[(r + 16) >> 2], size = i32(20);
  const extra = M.HEAPU32[(r + 24) >> 2], extraSize = i32(28);
  if (data && size > 0) out.data = M.HEAPU8.slice(data, data + size);
  if (extra && extraSize > 0) out.extra = M.HEAPU8.slice(extra, extra + extraSize);
  M._ps_wasm_result_free(r);
  if (status !== 0) {
    const error = new Error(text(M._ps_wasm_status_string(status)));
    error.status = status;
    throw error;
  }
  return out;
}

let timer = 0;
// Calls a C function with an RGBA image in the heap; tracks time spent in C.
function withImage(image, call) {
  const pointer = copyIn(image.data);
  try {
    const start = performance.now();
    const result = take(call(pointer, image.width, image.height));
    timer += performance.now() - start;
    return result;
  } finally {
    M._free(pointer);
  }
}

function withBytes(bytes, call) {
  const pointer = copyIn(bytes);
  try {
    const start = performance.now();
    const result = take(call(pointer, bytes.length));
    timer += performance.now() - start;
    return result;
  } finally {
    M._free(pointer);
  }
}

const asImage = (r) => ({ width: r.width, height: r.height, data: r.data });

// ---------------------------------------------------------------- operations

const ops = {
  version: () => text(M._ps_wasm_version()),

  // Bytes of any supported file -> RGBA. Falls back to the browser for WebP, AVIF, HEIC, SVG...
  decode: ({ bytes }) => {
    const r = withBytes(bytes, (p, n) => M._ps_wasm_decode(p, n));
    return { ...asImage(r), sourceChannels: r.values[0], format: r.values[1] };
  },

  encode: ({ image, format, quality = 75, subsampling = 1, gray = 0 }) => {
    const r = withImage(image, (p, w, h) => M._ps_wasm_encode(p, w, h, FORMATS[format] ?? format, quality, subsampling, gray));
    return { bytes: r.data, channels: r.values[0] };
  },

  // Encode, decode and measure: what the compress tool shows.
  roundtrip: ({ image, format, quality = 75, subsampling = 1, gray = 0, metrics = true }) => {
    const encoded = ops.encode({ image, format, quality, subsampling, gray });
    const decoded = ops.decode({ bytes: encoded.bytes });
    let values = null;
    if (metrics) {
      // The classic format keeps only whole 8x8 blocks: measure against the same crop.
      let reference = image;
      if (decoded.width !== image.width || decoded.height !== image.height)
        reference = ops.crop({ image, x: 0, y: 0, width: decoded.width, height: decoded.height });
      const pa = copyIn(reference.data), pb = copyIn(decoded.data);
      try {
        const start = performance.now();
        const r = take(M._ps_wasm_compare(pa, pb, decoded.width, decoded.height, 4));
        timer += performance.now() - start;
        values = { psnr: r.values[0], mse: r.values[1], ssim: r.values[2], diff: asImage(r) };
      } finally {
        M._free(pa);
        M._free(pb);
      }
    }
    return { bytes: encoded.bytes, image: { width: decoded.width, height: decoded.height, data: decoded.data }, metrics: values };
  },

  resize: ({ image, width, height, filter }) => asImage(withImage(image, (p, w, h) => M._ps_wasm_resize(p, w, h, width, height, filter))),
  crop: ({ image, x, y, width, height }) => asImage(withImage(image, (p, w, h) => M._ps_wasm_crop(p, w, h, x, y, width, height))),
  rotate: ({ image, degrees }) => asImage(withImage(image, (p, w, h) => M._ps_wasm_rotate(p, w, h, degrees))),
  flip: ({ image, horizontal }) => asImage(withImage(image, (p, w, h) => M._ps_wasm_flip(p, w, h, horizontal ? 1 : 0))),
  adjust: ({ image, brightness = 0, contrast = 0, gamma = 1, saturation = 0, hue = 0, temperature = 0 }) =>
    asImage(withImage(image, (p, w, h) => M._ps_wasm_adjust(p, w, h, brightness, contrast, gamma, saturation, hue, temperature))),
  effect: ({ image, kind, value = 0 }) => asImage(withImage(image, (p, w, h) => M._ps_wasm_effect(p, w, h, kind, value))),
  filter: ({ image, kind, a = 0, b = 0 }) => asImage(withImage(image, (p, w, h) => M._ps_wasm_filter(p, w, h, kind, a, b))),

  quantize: ({ image, colors, dither }) => {
    const r = withImage(image, (p, w, h) => M._ps_wasm_quantize(p, w, h, colors, dither));
    const palette = [];
    for (let i = 0; r.extra && i < r.extra.length; i += 3) palette.push([r.extra[i], r.extra[i + 1], r.extra[i + 2]]);
    return { ...asImage(r), palette };
  },

  compare: ({ a, b, amplify = 4 }) => {
    const pa = copyIn(a.data), pb = copyIn(b.data);
    try {
      const start = performance.now();
      const r = take(M._ps_wasm_compare(pa, pb, a.width, a.height, amplify));
      timer += performance.now() - start;
      return { psnr: r.values[0], mse: r.values[1], ssim: r.values[2], diff: asImage(r) };
    } finally {
      M._free(pa);
      M._free(pb);
    }
  },

  histogram: ({ image }) => {
    const r = withImage(image, (p, w, h) => M._ps_wasm_histogram(p, w, h));
    const all = new Uint32Array(r.extra.buffer, r.extra.byteOffset, 1024);
    return { r: all.slice(0, 256), g: all.slice(256, 512), b: all.slice(512, 768), luma: all.slice(768, 1024) };
  },

  inspect: ({ bytes }) => {
    const r = withBytes(bytes, (p, n) => M._ps_wasm_pxs_inspect(p, n));
    const [width, height, channels, quality, subsampling, header, payload] = r.values;
    const lengths = r.extra ? [0, 1, 2, 3].map((t) => r.extra.slice(t * 256, t * 256 + 256)) : [];
    return { width, height, channels, quality, subsampling, header, payload, lengths };
  },

  // One 8x8 block through the codec, step by step (layout: ps_block_trace in pixelsmith.h).
  block: ({ pixels, quality, chroma = 0 }) => {
    const r = withBytes(pixels, (p) => M._ps_wasm_block(p, quality, chroma));
    const buffer = r.extra.buffer, base = r.extra.byteOffset;
    const f64 = (offset) => Array.from(new Float64Array(buffer.slice(base + offset, base + offset + 512)));
    const i32 = (offset, count) => Array.from(new Int32Array(buffer.slice(base + offset, base + offset + count * 4)));
    const symbolCount = i32(2304, 1)[0];
    const flat = i32(2308, 192);
    const symbols = [];
    for (let i = 0; i < symbolCount; i++) symbols.push({ run: flat[i * 3], size: flat[i * 3 + 1], value: flat[i * 3 + 2] });
    return {
      pixels: f64(0),
      coefficients: f64(512),
      quant: i32(1024, 64),
      quantized: i32(1280, 64),
      zigzag: i32(1536, 64),
      reconstructed: f64(1792),
      symbols,
    };
  },

  dctMask: ({ image, mask }) => {
    const maskPointer = copyIn(mask);
    try {
      return asImage(withImage(image, (p, w, h) => M._ps_wasm_dct_mask(p, w, h, maskPointer)));
    } finally {
      M._free(maskPointer);
    }
  },

  quantTable: ({ quality, chroma = 0 }) => {
    const r = take(M._ps_wasm_quant_table(quality, chroma));
    return Array.from(new Int32Array(r.extra.buffer, r.extra.byteOffset, 64));
  },

  // Bytes and PSNR across qualities, for the curve.
  curve: ({ image, qualities }) => {
    const rows = [];
    for (const q of qualities) {
      const row = { quality: q };
      for (const [key, format, subsampling] of [["pxs420", "pxs", 1], ["pxs444", "pxs", 0], ["jpeg", "jpeg", 1]]) {
        const r = ops.roundtrip({ image, format, quality: q, subsampling });
        row[key] = { bytes: r.bytes.length, psnr: r.metrics.psnr, ssim: r.metrics.ssim };
      }
      rows.push(row);
    }
    return rows;
  },
};

// Transferables: every Uint8Array buffer in the result.
function transferables(value, list = []) {
  if (!value || typeof value !== "object") return list;
  if (ArrayBuffer.isView(value)) {
    if (!list.includes(value.buffer)) list.push(value.buffer);
    return list;
  }
  for (const key of Object.keys(value)) transferables(value[key], list);
  return list;
}

self.onmessage = async (event) => {
  const { id, op, args } = event.data;
  try {
    await ready;
    if (!ops[op]) throw new Error(`unknown operation ${op}`);
    timer = 0;
    const result = ops[op](args || {});
    self.postMessage({ id, ok: true, result, ms: timer }, transferables(result));
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error && error.message ? error.message : error) });
  }
};
