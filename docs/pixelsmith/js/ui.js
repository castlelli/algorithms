// Small shared helpers: theme colors, formatting, controls, canvases, files.

let themeCache = null;

// Resolved theme colors for canvas drawing.
export function theme() {
  if (themeCache) return themeCache;
  const style = getComputedStyle(document.documentElement);
  const v = (name) => style.getPropertyValue(name).trim();
  themeCache = {
    dark: v("--is-dark") === "1",
    bg: v("--bg"),
    surface: v("--surface"),
    surface2: v("--surface-2"),
    surface3: v("--surface-3"),
    line: v("--line"),
    lineStrong: v("--line-strong"),
    ink: v("--ink"),
    ink2: v("--ink-2"),
    ink3: v("--ink-3"),
    accent: v("--accent"),
    accentDeep: v("--accent-deep"),
    spark: v("--spark"),
    ok: v("--ok"),
    bad: v("--bad"),
    y: v("--y"),
    cb: v("--cb"),
    cr: v("--cr"),
    mono: v("--font-mono"),
    pixel: v("--font-pixel"),
    mark: v("--font-mark"),
  };
  return themeCache;
}

const themeListeners = new Set();
export function onThemeChange(listener) {
  themeListeners.add(listener);
}
export function invalidateTheme() {
  themeCache = null;
  for (const listener of themeListeners) listener();
}

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------- formatting

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 2 : 1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export const formatDb = (db) => (Number.isFinite(db) ? `${db.toFixed(2)} dB` : "∞ (identical)");
export const formatMs = (ms) => (ms < 10 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms`);

export function el(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "html") node.innerHTML = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of [].concat(children)) if (child != null) node.append(child);
  return node;
}

// ---------------------------------------------------------------- controls

export function segmented(group, onChange) {
  const buttons = [...group.querySelectorAll("button")];
  const set = (value, notify = true) => {
    for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.value === value));
    if (notify) onChange?.(value);
  };
  for (const b of buttons) b.addEventListener("click", () => set(b.dataset.value));
  return {
    set,
    get: () => buttons.find((b) => b.getAttribute("aria-pressed") === "true")?.dataset.value,
  };
}

// Keeps the filled part of a range track in sync (WebKit has no progress pseudo-element).
export function paintRange(input) {
  const min = Number(input.min || 0), max = Number(input.max || 100);
  const fill = ((Number(input.value) - min) / (max - min || 1)) * 100;
  input.style.setProperty("--fill", `${fill}%`);
}

let toastTimer;
export function toast(message) {
  document.querySelector(".toast")?.remove();
  const node = el("div", { class: "toast", role: "status", text: message });
  document.body.append(node);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.remove(), 3200);
}

// ---------------------------------------------------------------- canvas

// Sizes a canvas to its CSS box at device resolution; returns a context in CSS pixels.
export function fitCanvas(canvas, height) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth || canvas.parentElement.clientWidth;
  const h = height ?? canvas.clientHeight;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height: h };
}

export function toImageData(image) {
  return new ImageData(new Uint8ClampedArray(image.data.buffer, image.data.byteOffset, image.width * image.height * 4), image.width, image.height);
}

export async function toBitmap(image) {
  return createImageBitmap(toImageData(image));
}

// Puts an RGBA image on a canvas at its own resolution.
export function paintImage(canvas, image) {
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d").putImageData(toImageData(image), 0, 0);
}

// ---------------------------------------------------------------- files

export function download(bytes, name, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = el("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const baseName = (name) => name.replace(/\.[^.]+$/, "") || "image";

export const MIME = {
  png: "image/png",
  jpeg: "image/jpeg",
  bmp: "image/bmp",
  tga: "image/x-tga",
  pxs: "application/x-pixelsmith",
  classic: "text/plain",
};
export const EXTENSION = { png: "png", jpeg: "jpg", bmp: "bmp", tga: "tga", pxs: "pxs", classic: "txt" };

export function whenVisible(element, callback, margin = "200px") {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        callback();
      }
    },
    { rootMargin: margin },
  );
  observer.observe(element);
}

export function fnv1a(bytes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
