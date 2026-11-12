// Shared helpers: theme tokens, pt-BR numbers, crisp canvases, arrows and KaTeX.

const MINUS = "−";
let cached = null;

export const VECTOR_NAMES = ["v_rel", "v_arr", "v_abs", "a_rel", "a_arr", "a_arr_t", "a_arr_n", "a_cor", "a_abs"];

export function theme() {
  if (cached) return cached;
  const css = getComputedStyle(document.documentElement);
  const read = (name) => css.getPropertyValue(name).trim();
  const vec = {};
  for (const name of VECTOR_NAMES) vec[name] = read(`--${name.replaceAll("_", "-")}`);
  cached = {
    dark: read("--is-dark") === "1",
    bg: read("--bg"),
    surface: read("--surface"),
    line: read("--line"),
    grid: read("--grid"),
    ink: read("--ink"),
    ink2: read("--ink-2"),
    ink3: read("--ink-3"),
    disk: read("--disk"),
    diskRim: read("--disk-rim"),
    sector: read("--sector"),
    spoke: read("--spoke"),
    ghost: read("--ghost"),
    vec,
    sans: read("--font-sans"),
    mono: read("--font-mono"),
  };
  return cached;
}

export function invalidateTheme() {
  cached = null;
  document.dispatchEvent(new Event("themechange"));
}

export const onThemeChange = (callback) => document.addEventListener("themechange", callback);

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function withAlpha(hex, alpha) {
  const value = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

// ------------------------------------------------------------------------------- numbers
/** Fixed decimals, decimal comma and typographic minus; −0 becomes 0. */
export function fmt(value, digits = 3) {
  if (!Number.isFinite(value)) return "–";
  const fixed = Math.abs(value).toFixed(digits);
  const negative = value < 0 && Number(fixed) !== 0;
  return (negative ? MINUS : "") + fixed.replace(".", ",");
}

/** Significant figures, like formatacao.num (keeps trailing zeros). */
export function fmtSig(value, sig = 4) {
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
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
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
  return { redraw, size: () => ({ w, h }) };
}

/** Arrow from (x0, y0) to (x1, y1) in canvas pixels; the head shrinks for short arrows. */
export function arrow(ctx, x0, y0, x1, y1, color, width = 2.2, alpha = 1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.hypot(dx, dy);
  if (length < 0.5) return;
  const head = Math.min(11, 0.42 * length) * (width / 2.2) ** 0.5;
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

/** Vector label such as v_rel drawn as "v" with a small subscript. */
export function vectorLabel(ctx, name, x, y, color, size = 13) {
  const t = theme();
  const [base, ...rest] = name.split("_");
  const sub = { rel: "rel", arr: "arr", abs: "abs", cor: "cor" }[rest[0]] ?? rest.join("");
  const extra = rest[1] === "t" ? "·t" : rest[1] === "n" ? "·n" : "";
  ctx.save();
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.font = `600 italic ${size}px ${t.sans}`;
  ctx.fillText(base, x, y);
  const wBase = ctx.measureText(base).width;
  ctx.font = `500 ${Math.round(size * 0.72)}px ${t.mono}`;
  ctx.fillText(sub + extra, x + wBase + 1, y + size * 0.3);
  ctx.restore();
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
  const parts = source.split(/\$([^$]+)\$/);
  parts.forEach((part, i) => {
    if (i % 2 === 0) {
      if (part) element.append(document.createTextNode(part.replaceAll("~", " ")));
      return;
    }
    const span = document.createElement("span");
    tex(span, part.replaceAll("\\vb*{", "\\boldsymbol{").replaceAll("\\vb{", "\\mathbf{"));
    element.append(span);
  });
}

// ------------------------------------------------------------------------------ controls
/** Segmented control: buttons with data-value inside root; calls onChange(value). */
export function segmented(root, onChange) {
  const buttons = [...root.querySelectorAll("button")];
  const set = (value, fire = true) => {
    for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.value === value));
    if (fire) onChange(value);
  };
  for (const b of buttons) b.addEventListener("click", () => set(b.dataset.value));
  return { set, value: () => buttons.find((b) => b.getAttribute("aria-pressed") === "true")?.dataset.value };
}

export function setFill(slider) {
  const min = Number(slider.min);
  const max = Number(slider.max);
  slider.style.setProperty("--fill", `${((Number(slider.value) - min) / (max - min || 1)) * 100}%`);
}

/** Calls callback only while the element is on screen. */
export function whenVisible(element, callback) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) callback(entry.isIntersecting);
  }, { rootMargin: "120px" });
  observer.observe(element);
}
