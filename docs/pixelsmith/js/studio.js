// The studio: tool rail, live preview, inspector, pipeline of applied steps, export and batch.

import { run } from "./engine.js";
import { decodeFile, decodeUrl } from "./load.js";
import { TOOLS, TOOL_ICONS, clampCrop, toolById } from "./tools.js";
import { createViewer } from "./viewer.js";
import { EXTENSION, MIME, baseName, download, el, fitCanvas, formatBytes, onThemeChange, paintRange, segmented, theme, toast } from "./ui.js";
import { zip } from "./zip.js";

export function createStudio(root) {
  const $ = (selector) => root.querySelector(selector);
  const listeners = new Set();

  const state = {
    source: null, // { name, image, bytes, format, via }
    steps: [], // { tool, params, label, image }
    tool: "compress",
    params: {},
    preview: null,
    compareImage: null,
    view: "split",
    sample: null,
  };

  const working = () => (state.steps.length ? state.steps[state.steps.length - 1].image : state.source?.image);
  const tool = () => toolById(state.tool);
  const params = () => state.params[state.tool];

  // ---------------------------------------------------------------- viewer

  const zoomLabel = $("[data-zoom='fit']");
  const viewer = createViewer({
    stage: $("[data-stage]"),
    canvas: $("[data-canvas]"),
    handle: $("[data-split]"),
    beforeLabel: $("[data-label-before]"),
    afterLabel: $("[data-label-after]"),
    cropBox: $("[data-crop-box]"),
    onZoom: (scale, fitted) => (zoomLabel.textContent = fitted ? "Fit" : `${Math.round(scale * 100)}%`),
  });
  $("[data-zoom='in']").addEventListener("click", () => viewer.zoomIn());
  $("[data-zoom='out']").addEventListener("click", () => viewer.zoomOut());
  zoomLabel.addEventListener("click", () => viewer.fit());
  const view = segmented($("[data-view]"), (mode) => {
    state.view = mode;
    viewer.setMode(mode);
    if (mode === "diff") ensureDiff();
  });

  // ---------------------------------------------------------------- rail

  const rail = $("[data-rail]");
  let group = null;
  for (const t of TOOLS) {
    if (t.group !== group) {
      group = t.group;
      rail.append(el("p", { class: "rail-group", text: group }));
    }
    const button = el("button", { type: "button", class: "tool-button", "data-tool": t.id, html: `${TOOL_ICONS[t.id]}<span>${t.name}</span>` });
    button.addEventListener("click", () => selectTool(t.id));
    rail.append(button);
  }

  function selectTool(id) {
    state.tool = id;
    for (const b of rail.querySelectorAll(".tool-button")) b.setAttribute("aria-current", String(b.dataset.tool === id));
    const image = working();
    if (image && !state.params[id]) state.params[id] = toolById(id).defaults(image);
    $("[data-tool-title]").textContent = tool().name;
    $("[data-tool-blurb]").textContent = tool().blurb;
    renderControls();
    if (id === "crop") {
      view.set("before", false);
      state.view = "before";
      viewer.setMode("before");
    } else if (state.view === "before" && state.tool !== "crop") {
      view.set("split", false);
      state.view = "split";
      viewer.setMode("split");
    }
    refresh();
  }

  // ---------------------------------------------------------------- controls

  const controls = $("[data-controls]");

  function setParam(patch, rerender = false) {
    state.params[state.tool] = { ...params(), ...patch };
    if (rerender) renderControls();
    else syncControls();
    refresh();
  }

  function formatValue(c, value) {
    const digits = c.step >= 1 ? 0 : c.step >= 0.1 ? 1 : 2;
    const text = Number(value).toFixed(digits);
    return `${c.signed && value > 0 ? "+" : ""}${text}${c.unit || ""}`;
  }

  const syncers = [];
  function syncControls() {
    for (const sync of syncers) sync(params());
  }

  function renderControls() {
    controls.replaceChildren();
    syncers.length = 0;
    const image = working();
    if (!image) {
      controls.append(el("p", { class: "control-hint", text: "Open an image or pick a sample to begin." }));
      return;
    }
    const p = params();
    for (const c of tool().controls(p, image)) {
      if (!c) continue;
      const wrap = el("div", { class: "control" });
      if (c.type === "range") {
        const id = `c-${state.tool}-${c.key}`;
        const input = el("input", { type: "range", id, min: c.min, max: c.max, step: c.step, value: p[c.key] });
        const output = el("output", { for: id, text: formatValue(c, p[c.key]) });
        input.addEventListener("input", () => {
          paintRange(input);
          output.textContent = formatValue(c, Number(input.value));
          setParam({ [c.key]: Number(input.value) });
        });
        input.addEventListener("dblclick", () => {
          const value = tool().defaults(image)[c.key] ?? c.default;
          if (value != null) {
            input.value = value;
            input.dispatchEvent(new Event("input"));
          }
        });
        paintRange(input);
        syncers.push((q) => {
          if (Number(input.value) !== q[c.key]) {
            input.value = q[c.key];
            paintRange(input);
            output.textContent = formatValue(c, q[c.key]);
          }
        });
        wrap.append(el("label", { class: "control-label", for: id }, [el("span", { text: c.label }), output]), input);
      } else if (c.type === "segmented") {
        const group = el("div", { class: "segmented small", role: "group", "aria-label": c.label });
        for (const o of c.options) group.append(el("button", { type: "button", "data-value": o.value, "aria-pressed": String(String(p[c.key]) === String(o.value)), text: o.label }));
        segmented(group, (value) => setParam({ [c.key]: value }, true));
        wrap.append(el("span", { class: "control-label", text: c.label }), group);
      } else if (c.type === "select") {
        const id = `c-${state.tool}-${c.key}`;
        const select = el("select", { id });
        for (const o of c.options) select.append(el("option", { value: o.value, text: o.label, selected: o.value === p[c.key] }));
        select.addEventListener("change", () => setParam({ [c.key]: select.value, ...(c.resets?.(select.value) || {}) }, true));
        wrap.append(el("label", { class: "control-label", for: id, text: c.label }), select);
      } else if (c.type === "note") {
        wrap.append(el("p", { class: "control-hint", text: c.text }));
      } else if (c.type === "buttons") {
        const row = el("div", { class: "segmented small", role: "group", "aria-label": c.label });
        for (const b of c.buttons) {
          const button = el("button", { type: "button", "aria-pressed": String(!!b.pressed?.(p)), text: b.label });
          button.addEventListener("click", () => setParam(b.apply(params()), true));
          row.append(button);
        }
        wrap.append(el("span", { class: "control-label", text: c.label }), row);
      } else if (c.type === "presets") {
        const row = el("div", { class: "segmented small", role: "group", "aria-label": c.label });
        for (const o of c.options) {
          const button = el("button", { type: "button", "aria-pressed": "false", text: o.label });
          button.addEventListener("click", () => {
            state.params[state.tool] = c.apply(o.value, params(), working());
            syncControls();
            refresh();
          });
          row.append(button);
        }
        wrap.append(el("span", { class: "control-label", text: c.label }), row);
      } else if (c.type === "reset") {
        const button = el("button", { type: "button", class: "button small", text: c.label });
        button.addEventListener("click", () => {
          state.params[state.tool] = tool().defaults(image);
          renderControls();
          refresh();
        });
        wrap.append(button);
      } else if (c.type === "dimensions") {
        wrap.append(dimensionsControl(c, image));
      } else if (c.type === "crop") {
        wrap.append(cropControl());
      }
      controls.append(wrap);
    }
    updateCropOverlay();
  }

  function numberInput(label, key, onInput) {
    const id = `c-${state.tool}-${key}`;
    const input = el("input", { type: "number", id, min: 0, step: 1, value: params()[key], inputmode: "numeric" });
    input.addEventListener("input", () => {
      const value = Number(input.value);
      if (Number.isFinite(value) && value >= 0) onInput(value);
    });
    syncers.push((q) => {
      if (document.activeElement !== input && Number(input.value) !== q[key]) input.value = q[key];
    });
    return el("label", { class: "control", for: id }, [el("span", { class: "control-label", text: label }), input]);
  }

  function dimensionsControl(c, image) {
    const ratio = image.width / image.height;
    const lockIcon = '<svg viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M2 1h4v1H2zM1 2h1v2H1zM6 2h1v2H6zM1 4h6v4H1z"/></svg>';
    const lock = el("button", { type: "button", class: "lock", "aria-label": "Keep aspect ratio", "aria-pressed": String(params().lock), html: lockIcon });
    lock.addEventListener("click", () => {
      lock.setAttribute("aria-pressed", String(!params().lock));
      state.params[state.tool] = { ...params(), lock: !params().lock };
    });
    const w = numberInput("Width", "width", (v) => setParam(params().lock ? { width: v, height: Math.max(1, Math.round(v / ratio)) } : { width: v }));
    const h = numberInput("Height", "height", (v) => setParam(params().lock ? { height: v, width: Math.max(1, Math.round(v * ratio)) } : { height: v }));
    return el("div", { class: "control-row" }, [w, lock, h]);
  }

  function cropControl() {
    const grid = el("div", { class: "control-row", style: "grid-template-columns: 1fr 1fr" });
    for (const [label, key] of [["X", "x"], ["Y", "y"], ["Width", "width"], ["Height", "height"]])
      grid.append(numberInput(label, key, (v) => {
        setParam({ [key]: v });
        updateCropOverlay();
      }));
    return grid;
  }

  function updateCropOverlay() {
    const image = working();
    if (state.tool !== "crop" || !image) {
      viewer.setCrop(null);
      return;
    }
    const p = params();
    viewer.setCrop({
      rect: clampCrop(p, image),
      aspect: p.aspect === "free" ? 0 : Number(p.aspect),
      onChange: (rect) => setParam(rect),
    });
  }

  // ---------------------------------------------------------------- preview

  const stats = $("[data-stats]");
  const status = $("[data-status]");
  const palette = $("[data-palette]");
  const histogram = $("[data-histogram]");
  const busy = $("[data-busy]");
  const applyButton = $("[data-apply]");
  const downloadButton = $("[data-download]");

  let running = false, dirty = false, generation = 0;

  async function refresh() {
    if (!working()) return;
    if (running) {
      dirty = true;
      return;
    }
    running = true;
    const timer = setTimeout(() => (busy.hidden = false), 120);
    try {
      do {
        dirty = false;
        const mine = ++generation;
        const t = tool(), p = params(), image = working();
        try {
          const result = await t.run(image, p, { source: state.source.image, compareImage: state.compareImage });
          if (dirty || mine !== generation) continue;
          state.preview = { ...result, tool: t.id, params: p, base: image };
          await show();
          setStatus(result.message || "");
        } catch (error) {
          if (!dirty) setStatus(error.message, true);
        }
      } while (dirty);
    } finally {
      clearTimeout(timer);
      busy.hidden = true;
      running = false;
    }
  }

  async function show() {
    const p = state.preview;
    const before = p.before || p.base;
    await viewer.set({ before, after: p.image, diff: p.diff || null });
    if (state.view === "diff") ensureDiff();
    renderStats(p.stats || []);
    palette.hidden = !p.palette;
    if (p.palette) palette.replaceChildren(...p.palette.map((c) => el("span", { style: `background: rgb(${c.join(",")})`, title: `rgb(${c.join(", ")})` })));
    histogram.hidden = !p.histogram;
    if (p.histogram) drawHistogram(p.histogram);
    const t = tool();
    applyButton.disabled = t.applies === false || p.unchanged === true;
    applyButton.textContent = t.applies === false ? "Nothing to apply" : "Apply step";
    downloadButton.disabled = false;
    downloadButton.textContent = p.bytes ? `Download .${EXTENSION[p.format]}` : `Download ${exportFormat().toUpperCase()}`;
  }

  async function ensureDiff() {
    const p = state.preview;
    if (!p || p.diff) return viewer.redraw();
    const a = p.before || p.base, b = p.image;
    if (a.width !== b.width || a.height !== b.height) {
      setStatus("No difference view: the sizes differ.");
      return;
    }
    const { result } = await run("compare", { a, b, amplify: 4 });
    if (state.preview !== p) return;
    p.diff = result.diff;
    await viewer.set({ before: a, after: b, diff: p.diff });
  }

  function renderStats(list) {
    stats.replaceChildren(
      ...list.map((s) => el("div", { class: s.full ? "full" : null }, [el("dt", { text: s.label }), el("dd", { class: s.good ? "good" : null, text: s.value })])),
    );
  }

  function setStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle("error", error);
  }

  function drawHistogram(h) {
    const { ctx, width, height } = fitCanvas(histogram, 120);
    const t = theme();
    ctx.clearRect(0, 0, width, height);
    let max = 1;
    for (const channel of [h.r, h.g, h.b]) for (let v = 1; v < 255; v++) max = Math.max(max, channel[v]);
    const bar = width / 256;
    ctx.globalCompositeOperation = t.dark ? "lighter" : "multiply";
    const colors = t.dark ? ["rgba(255,80,80,0.75)", "rgba(80,220,120,0.7)", "rgba(80,150,255,0.8)"] : ["rgba(220,40,40,0.55)", "rgba(30,160,70,0.5)", "rgba(40,90,220,0.55)"];
    [h.r, h.g, h.b].forEach((channel, i) => {
      ctx.fillStyle = colors[i];
      for (let v = 0; v < 256; v++) {
        const y = Math.min(1, channel[v] / max) * (height - 4);
        ctx.fillRect(v * bar, height - y, Math.ceil(bar), y);
      }
    });
    ctx.globalCompositeOperation = "source-over";
  }

  onThemeChange(() => state.preview?.histogram && drawHistogram(state.preview.histogram));

  // ---------------------------------------------------------------- pipeline

  const pipeline = $("[data-pipeline]");
  const undoButton = $("[data-undo]");
  const resetButton = $("[data-reset]");

  function renderPipeline() {
    pipeline.replaceChildren(
      ...(state.steps.length ? state.steps.map((s) => el("li", { text: s.label })) : [el("li", { class: "pipeline-empty", text: "Apply a step to start a pipeline." })]),
    );
    undoButton.disabled = !state.steps.length;
    resetButton.disabled = !state.steps.length;
    pipeline.scrollLeft = pipeline.scrollWidth;
  }

  function changedImage() {
    // Geometry-dependent defaults follow the new size.
    const image = working();
    for (const id of ["resize", "crop"]) state.params[id] = toolById(id).defaults(image);
    renderControls();
    for (const listener of listeners) listener(image);
    refresh();
  }

  applyButton.addEventListener("click", () => {
    const p = state.preview;
    if (!p || p.unchanged) return;
    state.steps.push({ tool: p.tool, params: p.params, label: toolById(p.tool).label(p.params), image: p.image });
    toast(`Applied: ${toolById(p.tool).label(p.params)}`);
    renderPipeline();
    if (p.tool !== "compress") state.params[p.tool] = toolById(p.tool).defaults(p.image);
    changedImage();
  });
  undoButton.addEventListener("click", () => {
    state.steps.pop();
    renderPipeline();
    changedImage();
  });
  resetButton.addEventListener("click", () => {
    state.steps = [];
    renderPipeline();
    changedImage();
  });

  // ---------------------------------------------------------------- export

  function exportFormat() {
    return state.params.export?.format || "png";
  }

  downloadButton.addEventListener("click", async () => {
    const p = state.preview;
    if (!p) return;
    const name = baseName(state.source.name);
    try {
      if (p.bytes) {
        const suffix = p.tool === "compress" ? (p.format === "classic" ? "-classic" : `-q${p.params.quality}`) : "";
        download(p.bytes, `${name}${suffix}.${EXTENSION[p.format]}`, MIME[p.format]);
        return;
      }
      const format = exportFormat();
      const { result } = await run("encode", { image: p.image, format, quality: state.params.export?.quality ?? 85 });
      download(result.bytes, `${name}-pixelsmith.${EXTENSION[format]}`, MIME[format]);
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  // ---------------------------------------------------------------- opening images

  const drop = $("[data-drop]");
  const stage = $("[data-stage]");

  async function open(loader, label) {
    setStatus(`Opening ${label}…`);
    busy.hidden = false;
    try {
      const loaded = await loader();
      state.source = loaded;
      state.steps = [];
      state.params = {};
      state.compareImage = null;
      drop.classList.add("hidden");
      $("[data-file-name]").textContent = loaded.name;
      $("[data-file-dims]").textContent = `${loaded.image.width} × ${loaded.image.height} · ${loaded.format} · ${formatBytes(loaded.bytes.length)}`;
      renderPipeline();
      for (const t of TOOLS) state.params[t.id] = t.defaults(loaded.image);
      selectTool(state.tool);
      viewer.fit();
      for (const listener of listeners) listener(loaded.image);
      const via = loaded.via === "C" ? `Decoded by the C engine in ${loaded.ms.toFixed(1)} ms` : "Decoded by the browser (format not built into the engine)";
      setStatus(via);
    } catch (error) {
      setStatus(error.message, true);
      toast(error.message);
    } finally {
      busy.hidden = true;
    }
  }

  function markSample(name) {
    state.sample = name;
    for (const b of root.querySelectorAll("[data-sample]")) b.setAttribute("aria-pressed", String(b.dataset.sample === name));
  }

  function openSample(name) {
    markSample(name);
    return open(() => decodeUrl(`samples/${name}.png`, `${name}.png`), name);
  }

  for (const b of root.querySelectorAll("[data-sample]")) b.addEventListener("click", () => openSample(b.dataset.sample));
  for (const input of root.querySelectorAll("[data-open]"))
    input.addEventListener("change", () => {
      const file = input.files[0];
      input.value = "";
      if (!file) return;
      markSample(null);
      open(() => decodeFile(file), file.name);
    });

  stage.addEventListener("dragover", (event) => {
    event.preventDefault();
    stage.classList.add("dragging");
  });
  stage.addEventListener("dragleave", () => stage.classList.remove("dragging"));
  stage.addEventListener("drop", (event) => {
    event.preventDefault();
    stage.classList.remove("dragging");
    const file = event.dataTransfer.files[0];
    if (file) {
      markSample(null);
      open(() => decodeFile(file), file.name);
    }
  });
  window.addEventListener("paste", (event) => {
    const file = [...(event.clipboardData?.files || [])].find((f) => f.type.startsWith("image/"));
    if (file) {
      markSample(null);
      open(() => decodeFile(file), file.name || "pasted image");
    }
  });

  // Compare against another file: a hidden picker opened by the segmented control.
  const comparePicker = el("input", { type: "file", accept: "image/*,.pxs,.txt", hidden: true });
  root.append(comparePicker);
  comparePicker.addEventListener("change", async () => {
    const file = comparePicker.files[0];
    comparePicker.value = "";
    if (!file) return;
    try {
      state.compareImage = (await decodeFile(file)).image;
      setStatus(`Reference: ${file.name}`);
      refresh();
    } catch (error) {
      setStatus(error.message, true);
    }
  });
  controls.addEventListener("click", (event) => {
    const b = event.target.closest("button[data-value='file']");
    if (b && state.tool === "compare") comparePicker.click();
  });

  // ---------------------------------------------------------------- batch

  const batchInput = $("[data-batch]");
  batchInput.addEventListener("change", async () => {
    const files = [...batchInput.files];
    batchInput.value = "";
    if (!files.length) return;
    const format = exportFormat(), quality = state.params.export?.quality ?? 85;
    const outputs = [];
    const failures = [];
    busy.hidden = false;
    for (const [i, file] of files.entries()) {
      setStatus(`Batch: ${i + 1} of ${files.length}, ${file.name}`);
      try {
        let image = (await decodeFile(file)).image;
        for (const step of state.steps) {
          const t = toolById(step.tool);
          image = (await t.run(image, step.params, { source: image })).image;
        }
        const { result } = await run("encode", { image, format, quality });
        outputs.push({ name: `${baseName(file.name)}.${EXTENSION[format]}`, bytes: result.bytes });
      } catch (error) {
        failures.push(file.name);
      }
    }
    busy.hidden = true;
    if (outputs.length) download(zip(outputs), "pixelsmith-batch.zip", "application/zip");
    const steps = state.steps.length ? `${state.steps.length} step${state.steps.length > 1 ? "s" : ""}` : "no steps";
    setStatus(`Batch done: ${outputs.length} file${outputs.length === 1 ? "" : "s"} (${steps}, ${format.toUpperCase()})${failures.length ? `; skipped ${failures.join(", ")}` : ""}.`, failures.length > 0);
  });

  // ---------------------------------------------------------------- init

  selectTool("compress");
  renderPipeline();

  return {
    openSample,
    image: working,
    onImage: (listener) => listeners.add(listener),
    select: selectTool,
  };
}
