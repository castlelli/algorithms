// Shared helpers: theme tokens, localized numbers, crisp canvases, plane views, arrows, controls.

import { decimal } from "./i18n.js";

const MINUS = "−";
let cached = null;

const COLORS = ["curve", "ring", "disk", "pen", "tau", "n", "b", "v", "a", "at", "an", "rho"];

export function theme() {
  if (cached) return cached;
  const css = getComputedStyle(document.documentElement);
  const read = (name) => css.getPropertyValue(name).trim();
  const c = {};
  for (const name of COLORS) c[name] = read(`--c-${name}`);
  cached = {
    dark: read("--is-dark") === "1",
    bg: read("--bg"),
    surface: read("--surface"),
    line: read("--line"),
    grid: read("--grid"),
    grid2: read("--grid-2"),
    ink: read("--ink"),
    ink2: read("--ink-2"),
    ink3: read("--ink-3"),
    c,
    sans: read("--font-sans"),
    mono: read("--font-mono"),
    serif: read("--font-serif"),
  };
  return cached;
}

export function invalidateTheme() {
  cached = null;
  document.dispatchEvent(new Event("themechange"));
}

export const onThemeChange = (callback) => {
  document.addEventListener("themechange", callback);
  document.addEventListener("langchange", callback);
};

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function withAlpha(color, alpha) {
  const hex = color.replace("#", "");
  const value = parseInt(hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex, 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

// ------------------------------------------------------------------------------- numbers
/** Fixed decimals, the page's decimal separator and a typographic minus; −0 becomes 0. */
export function fmt(value, digits = 3) {
  if (value === Infinity) return "∞";
  if (!Number.isFinite(value)) return "–";
  const fixed = Math.abs(value).toFixed(digits);
  const negative = value < 0 && Number(fixed) !== 0;
  return (negative ? MINUS : "") + fixed.replace(".", decimal());
}

/** Significant figures, like formatacao.num (keeps trailing zeros). */
export function fmtSig(value, sig = 4) {
  if (value === Infinity) return "∞";
  if (!Number.isFinite(value)) return "–";
  if (value === 0) return "0";
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  if (exponent < -3 || exponent >= sig + 2) return fmtSci(value, sig - 1);
  return fmt(value, Math.max(0, sig - 1 - exponent));
}

const SUPERSCRIPT = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };

export function fmtSci(value, digits = 1) {
  if (!Number.isFinite(value)) return "–";
  if (value === 0) return "0";
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  let mantissa = value / 10 ** exponent;
  let e = exponent;
  if (Math.abs(Number(mantissa.toFixed(digits))) >= 10) {
    mantissa /= 10;
    e += 1;
  }
  const sup = String(e).split("").map((ch) => SUPERSCRIPT[ch]).join("");
  return `${fmt(mantissa, digits)}×10${sup}`;
}

export const fmtVec = (v, digits = 3) => `(${v.map((x) => fmt(x, digits)).join(decimal() === "," ? "; " : ", ")})`;

// -------------------------------------------------------------------------------- canvas
/**
 * Keeps a canvas at its CSS size times the device pixel ratio and calls draw(ctx, w, h)
 * in CSS pixels whenever the size or the theme changes. Returns { redraw, size }.
 */
export function crisp(canvas, draw) {
  const ctx = canvas.getContext("2d");
  let w = 0;
  let h = 0;
  const redraw = () => {
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, w, h);
  };
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    w = rect.width;
    h = rect.height;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    redraw();
  };
  new ResizeObserver(resize).observe(canvas);
  onThemeChange(redraw);
  resize();
  return { redraw, size: () => ({ w, h }), ctx };
}

/** Maps a square window [cx ± half] × [cy ± half] (y up) onto a w × h canvas. */
export function planeView(w, h, half, cx = 0, cy = 0, pad = 10) {
  const s = (Math.min(w, h) / 2 - pad) / half;
  const ox = w / 2;
  const oy = h / 2;
  return {
    s,
    x: (x) => ox + (x - cx) * s,
    y: (y) => oy - (y - cy) * s,
    pt: (p) => [ox + (p[0] - cx) * s, oy - (p[1] - cy) * s],
    inv: (px, py) => [cx + (px - ox) / s, cy - (py - oy) / s],
  };
}

/** Polyline through points already in canvas pixels. */
export function polyline(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
}

/** Faint drafting grid aligned with the plane view (minor and major lines). */
export function draftGrid(ctx, w, h, view, step) {
  const t = theme();
  const [x0, y1] = view.inv(0, 0);
  const [x1, y0] = view.inv(w, h);
  ctx.save();
  ctx.lineWidth = 1;
  for (const [k, color] of [[1, t.grid], [5, t.grid2]]) {
    const d = step * k;
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let x = Math.ceil(x0 / d) * d; x <= x1; x += d) {
      const px = Math.round(view.x(x)) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
    }
    for (let y = Math.ceil(y0 / d) * d; y <= y1; y += d) {
      const py = Math.round(view.y(y)) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Arrow from (x0, y0) to (x1, y1) in canvas pixels; the head shrinks for short arrows. */
export function arrow(ctx, x0, y0, x1, y1, color, width = 2, alpha = 1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.hypot(dx, dy);
  if (length < 0.5) return;
  const head = Math.min(10, 0.42 * length) * (width / 2) ** 0.5;
  const ux = dx / length;
  const uy = dy / length;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1 - ux * head * 0.7, y1 - uy * head * 0.7);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - ux * head - uy * head * 0.42, y1 - uy * head + ux * head * 0.42);
  ctx.lineTo(x1 - ux * head + uy * head * 0.42, y1 - uy * head - ux * head * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Italic symbol with an optional subscript, e.g. label(ctx, "a", "t", …). */
export function label(ctx, base, subText, x, y, color, size = 13, bold = false) {
  const t = theme();
  ctx.save();
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.font = `${bold ? 700 : 600} italic ${size}px ${t.sans}`;
  ctx.fillText(base, x, y);
  if (subText) {
    const wBase = ctx.measureText(base).width;
    ctx.font = `500 ${Math.round(size * 0.72)}px ${t.mono}`;
    ctx.fillText(subText, x + wBase + 1, y + size * 0.3);
  }
  ctx.restore();
}

export function dot2(ctx, x, y, r, fill, stroke = null, lw = 1.2) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

// --------------------------------------------------------------------------------- KaTeX
export function tex(element, latex, displayMode = false) {
  if (window.katex) {
    try {
      window.katex.render(latex, element, { displayMode, throwOnError: false, strict: false });
      return;
    } catch (error) {
      // Falls through to the source text.
    }
  }
  element.textContent = latex;
}

/** Text with inline $...$ math, as in the LaTeX descriptions of the report's checks. */
export function texMixed(element, source) {
  element.replaceChildren();
  source.split(/\$([^$]+)\$/).forEach((part, i) => {
    if (i % 2 === 0) {
      if (part) element.append(document.createTextNode(part.replaceAll("~", " ")));
      return;
    }
    const span = document.createElement("span");
    tex(span, part);
    element.append(span);
  });
}

/** Renders every [data-tex] element (static formulas in the page). */
export function renderStaticTex(root = document) {
  for (const el of root.querySelectorAll("[data-tex]")) tex(el, el.dataset.tex, el.hasAttribute("data-display"));
}

// ------------------------------------------------------------------------------ controls
/** Segmented control: buttons with data-value inside root; calls onChange(value). */
export function segmented(root, onChange) {
  const buttons = () => [...root.querySelectorAll("button")];
  const set = (value, fire = true) => {
    for (const b of buttons()) b.setAttribute("aria-pressed", String(b.dataset.value === String(value)));
    if (fire) onChange(String(value));
  };
  root.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (button && root.contains(button)) set(button.dataset.value);
  });
  return { set, value: () => buttons().find((b) => b.getAttribute("aria-pressed") === "true")?.dataset.value };
}

/** Toggle button with aria-pressed; calls onChange(on). */
export function toggle(button, onChange) {
  button.addEventListener("click", () => {
    const on = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(on));
    onChange(on);
  });
  return () => button.getAttribute("aria-pressed") === "true";
}

export function setFill(slider) {
  const min = Number(slider.min);
  const max = Number(slider.max);
  slider.style.setProperty("--fill", `${((Number(slider.value) - min) / (max - min || 1)) * 100}%`);
}

/** Range input wired to a callback, with the filled track kept in sync. */
export function slider(input, onInput) {
  const update = () => {
    setFill(input);
    onInput(Number(input.value));
  };
  input.addEventListener("input", update);
  setFill(input);
  return {
    set(value, fire = false) {
      input.value = String(value);
      setFill(input);
      if (fire) onInput(Number(input.value));
    },
    get: () => Number(input.value),
  };
}

/** Calls callback(visible) as the element enters or leaves the screen. */
export function whenVisible(element, callback) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) callback(entry.isIntersecting);
  }, { rootMargin: "120px" });
  observer.observe(element);
}

/**
 * requestAnimationFrame loop that runs only while `element` is visible and `running()` is true.
 * step(dt) advances the state; returns { kick } to restart the loop after a state change.
 */
export function loop(element, running, step) {
  let visible = false;
  let frame = 0;
  let previous = 0;
  const tick = (now) => {
    const dt = previous ? Math.min(0.05, (now - previous) / 1000) : 0;
    previous = now;
    step(dt);
    frame = visible && running() ? requestAnimationFrame(tick) : 0;
  };
  const kick = () => {
    if (visible && running() && !frame) {
      previous = 0;
      frame = requestAnimationFrame(tick);
    }
  };
  whenVisible(element, (on) => {
    visible = on;
    kick();
  });
  return { kick };
}

/** Pointer drag on a canvas: onDrag(x, y) in CSS pixels, from pointerdown until pointerup. */
export function drag(canvas, onDrag, onStart = () => {}) {
  let active = false;
  const at = (event) => {
    const rect = canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };
  canvas.addEventListener("pointerdown", (event) => {
    active = true;
    canvas.setPointerCapture(event.pointerId);
    onStart(...at(event));
    onDrag(...at(event));
  });
  canvas.addEventListener("pointermove", (event) => active && onDrag(...at(event)));
  const end = () => (active = false);
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
}
