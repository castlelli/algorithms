// Verification: run each recorded call of the engine here, in WebAssembly, and compare with the
// native build's results (data/checks.json, written by `make site-data`).

import { run } from "./engine.js";
import { el, fnv1a } from "./ui.js";

export function createChecks(root) {
  const list = root.querySelector("[data-checks]");
  const summary = root.querySelector("[data-checks-summary]");
  const button = root.querySelector("[data-checks-run]");
  let spec = null, running = false;
  const fixtures = new Map();

  async function fixtureBytes(name) {
    if (!fixtures.has(`bytes:${name}`)) {
      const response = await fetch(`data/fixtures/${name}`);
      fixtures.set(`bytes:${name}`, new Uint8Array(await response.arrayBuffer()));
    }
    return fixtures.get(`bytes:${name}`);
  }

  async function fixtureImage(name) {
    if (!fixtures.has(name)) fixtures.set(name, (await run("decode", { bytes: await fixtureBytes(name.includes(".") ? name : `${name}.png`) })).result);
    return fixtures.get(name);
  }

  // Runs one check; returns { ok, text }.
  async function execute(check) {
    const e = check.expect;
    const image = check.input ? await fixtureImage(check.input) : null;
    let bytes, result;
    switch (check.call) {
      case "encode": {
        const [format, quality, subsampling, gray] = check.args;
        bytes = (await run("encode", { image, format, quality, subsampling, gray })).result.bytes;
        break;
      }
      case "roundtrip": {
        const [format, quality, subsampling, gray] = check.args;
        const encoded = (await run("encode", { image, format, quality, subsampling, gray })).result.bytes;
        result = (await run("decode", { bytes: encoded })).result;
        break;
      }
      case "decode":
        result = (await run("decode", { bytes: await fixtureBytes(check.file) })).result;
        break;
      case "resize":
        result = (await run("resize", { image, width: check.args[0], height: check.args[1], filter: check.args[2] })).result;
        break;
      case "rotate":
        result = (await run("rotate", { image, degrees: check.args[0] })).result;
        break;
      case "adjust": {
        const [brightness, contrast, gamma, saturation, hue, temperature] = check.args;
        result = (await run("adjust", { image, brightness, contrast, gamma, saturation, hue, temperature })).result;
        break;
      }
      case "effect":
        result = (await run("effect", { image, kind: check.args[0], value: check.args[1] })).result;
        break;
      case "filter":
        result = (await run("filter", { image, kind: check.args[0], a: check.args[1], b: check.args[2] })).result;
        break;
      case "quantize":
        result = (await run("quantize", { image, colors: check.args[0], dither: check.args[1] })).result;
        break;
      case "compare": {
        const other = await fixtureImage(check.file);
        const r = (await run("compare", { a: image, b: other })).result;
        const got = [r.psnr, r.mse, r.ssim];
        const worst = Math.max(...got.map((v, i) => Math.abs(v - e.values[i])));
        return { ok: worst < 1e-9, text: `PSNR ${got[0].toFixed(4)} dB, Δ ${worst.toExponential(1)}` };
      }
      default:
        return { ok: false, text: "unknown check" };
    }
    if (result) {
      bytes = result.data;
      if (result.width !== e.width || result.height !== e.height) return { ok: false, text: `size ${result.width}×${result.height}` };
    }
    const hash = fnv1a(bytes);
    const ok = hash === e.hash && bytes.length === e.size;
    if (ok) return { ok, text: `${bytes.length.toLocaleString("en")} bytes identical` };
    // Not identical: say how far off, for images.
    return { ok, text: bytes.length !== e.size ? `size ${bytes.length} ≠ ${e.size}` : `hash ${hash.toString(16)} ≠ ${e.hash.toString(16)}` };
  }

  async function runAll() {
    if (running) return;
    running = true;
    button.disabled = true;
    try {
      spec ??= await fetch("data/checks.json").then((r) => r.json());
      list.replaceChildren();
      const rows = new Map();
      const groups = new Map();
      for (const check of spec.checks) {
        if (!groups.has(check.group)) {
          const ul = el("ul");
          const panel = el("section", { class: "panel check-group" }, [el("h3", { text: check.group }), ul]);
          list.append(panel);
          groups.set(check.group, ul);
        }
        const result = el("span", { class: "check-result", text: "…" });
        const li = el("li", { class: "check running" }, [
          el("span", { class: "check-mark", "aria-hidden": "true" }),
          el("span", { class: "check-title", text: check.title }),
          result,
          el("span", { class: "check-detail", text: check.detail }),
        ]);
        groups.get(check.group).append(li);
        rows.set(check.id, { li, result });
      }
      let passed = 0;
      const start = performance.now();
      for (const check of spec.checks) {
        const row = rows.get(check.id);
        let outcome;
        try {
          outcome = await execute(check);
        } catch (error) {
          outcome = { ok: false, text: error.message };
        }
        passed += outcome.ok;
        row.li.className = `check ${outcome.ok ? "ok" : "bad"}`;
        row.result.textContent = outcome.text;
        summary.innerHTML = `<span class="${passed === spec.checks.length ? "ok" : "bad"}">${passed} of ${spec.checks.length}</span> checks agree with the native build`;
      }
      const seconds = ((performance.now() - start) / 1000).toFixed(1);
      summary.innerHTML = `<span class="${passed === spec.checks.length ? "ok" : "bad"}">${passed} of ${spec.checks.length}</span> checks agree with the native build <small>(${seconds} s)</small>`;
      root.dataset.checksDone = String(passed);
    } catch (error) {
      summary.textContent = `Could not run the checks: ${error.message}`;
    } finally {
      running = false;
      button.disabled = false;
    }
  }

  button.addEventListener("click", runAll);
  return { run: runAll };
}
