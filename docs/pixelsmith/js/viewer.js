// The studio stage: draws the before and after images with zoom, pan, a split divider, a difference
// view, and a crop rectangle drawn by dragging.

import { toBitmap } from "./ui.js";

export function createViewer({ stage, canvas, handle, beforeLabel, afterLabel, cropBox, onZoom }) {
  const ctx = canvas.getContext("2d");
  const state = {
    before: null, // { image, bitmap }
    after: null,
    diff: null,
    mode: "split",
    split: 0.5,
    scale: 1,
    ox: 0,
    oy: 0,
    fitted: true,
    crop: null, // { rect, aspect, onChange }
  };
  let width = 0, height = 0, dpr = 1, frame = 0;

  const same = () => state.before && state.after && state.before.image.width === state.after.image.width && state.before.image.height === state.after.image.height;
  const reference = () => state.after?.image || state.before?.image;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = stage.clientWidth;
    height = stage.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    if (state.fitted) fit(false);
    draw();
  }

  function fitScale(image) {
    return Math.min((width - 24) / image.width, (height - 24) / image.height, 8);
  }

  function fit(redraw = true) {
    const image = reference();
    state.fitted = true;
    if (image) {
      state.scale = Math.max(0.01, fitScale(image));
      state.ox = (width - image.width * state.scale) / 2;
      state.oy = (height - image.height * state.scale) / 2;
    }
    onZoom?.(state.scale, true);
    if (redraw) draw();
  }

  function zoomAt(factor, cx = width / 2, cy = height / 2) {
    const image = reference();
    if (!image) return;
    const scale = Math.min(32, Math.max(0.02, state.scale * factor));
    const k = scale / state.scale;
    state.ox = cx - (cx - state.ox) * k;
    state.oy = cy - (cy - state.oy) * k;
    state.scale = scale;
    state.fitted = false;
    onZoom?.(scale, false);
    draw();
  }

  function draw() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(paint);
  }

  function blit(entry, clip, ownFit) {
    if (!entry) return;
    const image = entry.image;
    let s = state.scale, ox = state.ox, oy = state.oy;
    if (ownFit) {
      s = fitScale(image);
      ox = (width - image.width * s) / 2;
      oy = (height - image.height * s) / 2;
    }
    ctx.save();
    if (clip) {
      ctx.beginPath();
      ctx.rect(clip[0], 0, clip[1] - clip[0], height);
      ctx.clip();
    }
    ctx.imageSmoothingEnabled = s < 1;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(entry.bitmap, ox, oy, image.width * s, image.height * s);
    ctx.restore();
  }

  function paint() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const split = state.mode === "split" && same() && state.before !== state.after;
    handle.hidden = !split;
    beforeLabel.hidden = !(split || state.mode === "before");
    afterLabel.hidden = !(split || state.mode === "after" || state.mode === "diff");
    afterLabel.textContent = state.mode === "diff" ? "Difference" : "After";
    if (state.mode === "before") blit(state.before, null, !same());
    else if (state.mode === "diff") blit(state.diff || state.after, null, false);
    else if (split) {
      const x = state.split * width;
      blit(state.before, [0, x], false);
      blit(state.after, [x, width], false);
      handle.style.left = `${x}px`;
    } else blit(state.after || state.before, null, false);
    paintCrop();
  }

  function paintCrop() {
    const c = state.crop;
    const image = state.before?.image;
    if (!c || !image || state.mode !== "before") {
      cropBox.hidden = true;
      return;
    }
    const s = fitScale(image);
    const ox = (width - image.width * s) / 2, oy = (height - image.height * s) / 2;
    cropBox.hidden = false;
    cropBox.style.left = `${ox + c.rect.x * s}px`;
    cropBox.style.top = `${oy + c.rect.y * s}px`;
    cropBox.style.width = `${c.rect.width * s}px`;
    cropBox.style.height = `${c.rect.height * s}px`;
  }

  // ---------------------------------------------------------------- input

  const pointers = new Map();
  let drag = null;

  function toImage(event) {
    const image = state.before.image;
    const s = fitScale(image);
    const r = stage.getBoundingClientRect();
    const ox = (width - image.width * s) / 2, oy = (height - image.height * s) / 2;
    return {
      x: Math.max(0, Math.min(image.width, (event.clientX - r.left - ox) / s)),
      y: Math.max(0, Math.min(image.height, (event.clientY - r.top - oy) / s)),
    };
  }

  stage.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".drop:not(.hidden)") || event.button > 0) return;
    stage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (event.target === handle || handle.contains(event.target)) {
      drag = { kind: "split" };
    } else if (state.crop && state.before && state.mode === "before") {
      drag = { kind: "crop", start: toImage(event) };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      drag = { kind: "pinch", distance: Math.hypot(a.x - b.x, a.y - b.y) };
    } else {
      drag = { kind: "pan", x: event.clientX, y: event.clientY };
      stage.classList.add("panning");
    }
  });

  stage.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!drag) return;
    if (drag.kind === "split") {
      const r = stage.getBoundingClientRect();
      state.split = Math.max(0, Math.min(1, (event.clientX - r.left) / r.width));
      draw();
    } else if (drag.kind === "pan") {
      state.ox += event.clientX - drag.x;
      state.oy += event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      state.fitted = false;
      draw();
    } else if (drag.kind === "pinch" && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const r = stage.getBoundingClientRect();
      zoomAt(distance / drag.distance, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      drag.distance = distance;
    } else if (drag.kind === "crop") {
      const p = toImage(event), s = drag.start;
      let w = Math.abs(p.x - s.x), h = Math.abs(p.y - s.y);
      const aspect = Number(state.crop.aspect);
      if (aspect > 0) {
        if (w / aspect > h) h = w / aspect;
        else w = h * aspect;
      }
      const image = state.before.image;
      let x = p.x < s.x ? s.x - w : s.x, y = p.y < s.y ? s.y - h : s.y;
      x = Math.max(0, Math.min(image.width - w, x));
      y = Math.max(0, Math.min(image.height - h, y));
      w = Math.min(w, image.width);
      h = Math.min(h, image.height);
      state.crop.rect = { x: Math.round(x), y: Math.round(y), width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
      paintCrop();
    }
  });

  const end = (event) => {
    pointers.delete(event.pointerId);
    if (drag?.kind === "crop" && state.crop) state.crop.onChange(state.crop.rect);
    if (pointers.size === 0) drag = null;
    stage.classList.remove("panning");
  };
  stage.addEventListener("pointerup", end);
  stage.addEventListener("pointercancel", end);

  stage.addEventListener(
    "wheel",
    (event) => {
      if (!reference() || state.crop) return;
      event.preventDefault();
      const r = stage.getBoundingClientRect();
      zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - r.left, event.clientY - r.top);
    },
    { passive: false },
  );

  stage.addEventListener("keydown", (event) => {
    if (event.key === "+" || event.key === "=") zoomAt(1.25);
    else if (event.key === "-") zoomAt(0.8);
    else if (event.key === "0") fit();
    else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      state.split = Math.max(0, Math.min(1, state.split + (event.key === "ArrowLeft" ? -0.05 : 0.05)));
      draw();
    } else return;
    event.preventDefault();
  });

  new ResizeObserver(resize).observe(stage);

  // ---------------------------------------------------------------- api

  async function entry(image) {
    return image ? { image, bitmap: await toBitmap(image) } : null;
  }

  let token = 0;
  return {
    async set({ before, after, diff }, { refit = false } = {}) {
      const mine = ++token;
      const [b, a, d] = await Promise.all([
        before === state.before?.image ? state.before : entry(before),
        after === state.after?.image ? state.after : after === before ? null : entry(after),
        diff === state.diff?.image ? state.diff : entry(diff),
      ]);
      if (mine !== token) return;
      const previous = reference();
      state.before = b;
      state.after = after === before ? b : a;
      state.diff = d;
      const now = reference();
      if (refit || state.fitted || !previous || previous.width !== now?.width || previous.height !== now?.height) fit(false);
      draw();
    },
    setMode(mode) {
      state.mode = mode;
      draw();
    },
    hasDiff: () => !!state.diff,
    fit,
    zoomIn: () => zoomAt(1.25),
    zoomOut: () => zoomAt(0.8),
    setCrop(crop) {
      state.crop = crop;
      stage.classList.toggle("cropping", !!crop);
      draw();
    },
    updateCropRect(rect) {
      if (state.crop) {
        state.crop.rect = rect;
        paintCrop();
      }
    },
    redraw: draw,
  };
}
