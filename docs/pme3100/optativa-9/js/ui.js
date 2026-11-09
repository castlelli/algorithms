// Shared drawing helpers: theme colours, pt-BR number formatting and a small canvas plot frame.

const MINUS = "−";
let cachedTheme = null;

export function theme() {
  if (cachedTheme) return cachedTheme;
  const css = getComputedStyle(document.documentElement);
  const read = (name) => css.getPropertyValue(name).trim();
  cachedTheme = {
    bg: read("--bg"),
    surface: read("--surface"),
    grid: read("--grid"),
    axis: read("--axis"),
    ink: read("--ink"),
    ink2: read("--ink-2"),
    ink3: read("--ink-3"),
    cases: { A: read("--case-a"), B: read("--case-b"), C: read("--case-c"), D: read("--case-d"), E: read("--case-e") },
    free: read("--case-free"),
    dark: read("--is-dark") === "1",
    sans: read("--font-sans"),
    mono: read("--font-mono"),
  };
  return cachedTheme;
}

export function onThemeChange(callback) {
  document.addEventListener("themechange", callback);
}

export function invalidateTheme() {
  cachedTheme = null;
  document.dispatchEvent(new Event("themechange"));
}

export function hexToRgb(hex) {
  const value = parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function withAlpha(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// pt-BR: decimal comma and a typographic minus sign.
export function fmt(value, digits = 2) {
  if (!Number.isFinite(value)) return "–";
  const fixed = Math.abs(value).toFixed(digits).replace(".", ",");
  return (value < 0 && Number(value.toFixed(digits)) !== 0 ? MINUS : "") + fixed;
}

export function fmtSci(value, digits = 1) {
  if (!Number.isFinite(value)) return "–";
  if (value === 0) return "0";
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const mantissa = value / 10 ** exponent;
  return `${fmt(mantissa, digits)}×10${superscript(exponent)}`;
}

export function superscript(n) {
  const digits = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  return (n < 0 ? "⁻" : "") + String(Math.abs(n)).replace(/\d/g, (d) => digits[d]);
}

export function trimmed(value, digits = 3) {
  const text = fmt(value, digits);
  return text.includes(",") ? text.replace(/0+$/, "").replace(/,$/, "") : text;
}

export function niceTicks(lo, hi, target = 5) {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / target;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw);
  const ticks = [];
  for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + step * 1e-9; t += step) ticks.push(Math.abs(t) < step * 1e-9 ? 0 : t);
  return ticks;
}

export function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Calls back with true/false as the element enters or leaves the viewport.
export function watchVisibility(element, callback) {
  const observer = new IntersectionObserver((entries) => callback(entries[entries.length - 1].isIntersecting), { rootMargin: "80px" });
  observer.observe(element);
}

export function fitCanvas(canvas) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(canvas.clientWidth));
  const height = Math.max(1, Math.round(canvas.clientHeight));
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width, height, ratio };
}

export function onResize(element, callback) {
  let pending = false;
  new ResizeObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      callback();
    });
  }).observe(element);
}

// Cartesian frame on a canvas: scales, recessive grid, tick labels and axis titles.
export class Plot {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.margin = { left: 46, right: 14, top: 12, bottom: 34, ...options.margin };
    this.xLabel = options.xLabel ?? "";
    this.yLabel = options.yLabel ?? "";
    this.xTickFormat = options.xTickFormat ?? ((t) => trimmed(t));
    this.yTickFormat = options.yTickFormat ?? ((t) => trimmed(t));
    this.xTicks = options.xTicks ?? 6;
    this.yTicks = options.yTicks ?? 5;
    this.view = [0, 1, 0, 1];
    this.width = 1;
    this.height = 1;
  }

  setView(x0, x1, y0, y1) {
    this.view = [x0, x1, y0, y1];
  }

  get inner() {
    const m = this.margin;
    return { left: m.left, top: m.top, width: Math.max(1, this.width - m.left - m.right), height: Math.max(1, this.height - m.top - m.bottom) };
  }

  px(x) {
    const { left, width } = this.inner;
    return left + ((x - this.view[0]) / (this.view[1] - this.view[0])) * width;
  }

  py(y) {
    const { top, height } = this.inner;
    return top + (1 - (y - this.view[2]) / (this.view[3] - this.view[2])) * height;
  }

  invX(px) {
    const { left, width } = this.inner;
    return this.view[0] + ((px - left) / width) * (this.view[1] - this.view[0]);
  }

  invY(py) {
    const { top, height } = this.inner;
    return this.view[2] + (1 - (py - top) / height) * (this.view[3] - this.view[2]);
  }

  contains(px, py) {
    const { left, top, width, height } = this.inner;
    return px >= left && px <= left + width && py >= top && py <= top + height;
  }

  // Clears the canvas and draws grid, ticks and labels. Returns the 2D context.
  begin() {
    const { ctx, width, height, ratio } = fitCanvas(this.canvas);
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.ratio = ratio;
    const colors = theme();
    const { left, top, width: w, height: h } = this.inner;
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1;
    ctx.font = `11px ${colors.sans}`;
    ctx.fillStyle = colors.ink3;
    ctx.strokeStyle = colors.grid;

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const tick of niceTicks(this.view[0], this.view[1], this.xTicks)) {
      const x = Math.round(this.px(tick)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + h);
      ctx.stroke();
      ctx.fillText(this.xTickFormat(tick), x, top + h + 6);
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const tick of niceTicks(this.view[2], this.view[3], this.yTicks)) {
      const y = Math.round(this.py(tick)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + w, y);
      ctx.stroke();
      ctx.fillText(this.yTickFormat(tick), left - 7, y);
    }

    ctx.font = `12px ${colors.sans}`;
    ctx.fillStyle = colors.ink2;
    if (this.xLabel) {
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(this.xLabel, left + w, height - 2);
    }
    if (this.yLabel) {
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(this.yLabel, left + 6, top + 4);
    }
    return ctx;
  }

  clip(draw) {
    const { left, top, width, height } = this.inner;
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(left, top, width, height);
    this.ctx.clip();
    draw(this.ctx);
    this.ctx.restore();
  }

  zeroLines() {
    const colors = theme();
    const { left, top, width, height } = this.inner;
    const ctx = this.ctx;
    ctx.strokeStyle = colors.axis;
    ctx.lineWidth = 1;
    if (this.view[0] < 0 && this.view[1] > 0) {
      const x = Math.round(this.px(0)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + height);
      ctx.stroke();
    }
    if (this.view[2] < 0 && this.view[3] > 0) {
      const y = Math.round(this.py(0)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + width, y);
      ctx.stroke();
    }
  }
}

// Pointer position relative to a canvas, in CSS pixels.
export function pointerPosition(event, canvas) {
  const box = canvas.getBoundingClientRect();
  return [event.clientX - box.left, event.clientY - box.top];
}

// Floating tooltip shared by the static charts.
export function createTooltip(host) {
  const node = document.createElement("div");
  node.className = "tooltip";
  node.hidden = true;
  host.appendChild(node);
  return {
    show(x, y, html) {
      node.innerHTML = html;
      node.hidden = false;
      const hostWidth = host.clientWidth;
      const flip = x > hostWidth - node.offsetWidth - 24;
      node.style.left = `${flip ? x - node.offsetWidth - 14 : x + 14}px`;
      node.style.top = `${Math.max(4, y - node.offsetHeight - 10)}px`;
    },
    hide() {
      node.hidden = true;
    },
  };
}

// Top-left corner of `element` measured from the top-left corner of `host`.
export function offsetWithin(host, element) {
  const outer = host.getBoundingClientRect();
  const inner = element.getBoundingClientRect();
  return [inner.left - outer.left, inner.top - outer.top];
}
