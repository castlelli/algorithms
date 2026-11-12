// The browser redoes the report: values at the instant of items (b) and (c), and the checks of
// verificacao.py, compared with the numbers exported by codigo/site.py.

import { TABLE_ROWS, createMotion, norm, verify } from "./model.js";
import { VECTOR_INFO } from "./lab.js";
import { fmt, fmtSci, fmtSig, segmented, texMixed } from "./ui.js";

const SCALARS = [
  ["r", "<i>r</i> [m]"],
  ["phi", "<i>φ</i> [rad]"],
  ["omega", "<i>ω</i> [rad/s]"],
  ["alpha", "<i>α</i> [rad/s²]"],
  ["v", "<i>v</i> [m/s]"],
  ["vdot", "<i>v̇</i> [m/s²]"],
];

export function createChecks(report) {
  const root = document.getElementById("conferencia");
  const valuesBody = root.querySelector("[data-check-values]");
  const rowsBody = root.querySelector("[data-check-rows]");
  const status = root.querySelector("[data-check-status]");
  let entry = report.casos[0];

  function run() {
    const start = performance.now();
    const m = createMotion({ ...entry.params });
    const checks = verify(m);
    const elapsed = performance.now() - start;
    const e = m.state(entry.params.t);
    let worst = 0;

    const lines = [];
    const row = (label, py, js, digits = 6) => {
      const diff = Math.abs(py - js);
      worst = Math.max(worst, diff);
      lines.push(`<tr><td>${label}</td><td>${fmtSig(py, digits)}</td><td>${fmtSig(js, digits)}</td><td>${diff === 0 ? "0" : fmtSci(diff, 1)}</td></tr>`);
    };
    row("<i>t</i><sub>f</sub> [s]", entry.t_f, m.tf, 8);
    lines.push(`<tr class="sub"><td colspan="4">em <i>t</i> = ${fmt(entry.params.t, 2)} s</td></tr>`);
    for (const [key, label] of SCALARS) row(label, entry.escalares[key], e[key]);
    for (const name of TABLE_ROWS) {
      const ref = entry.tabela[name];
      const js = e.cart(name);
      // The difference column holds the largest component difference, in (i, j).
      const diff = Math.max(Math.abs(ref.cart[0] - js[0]), Math.abs(ref.cart[1] - js[1]));
      worst = Math.max(worst, diff);
      const info = VECTOR_INFO[name];
      const symbol = info.sub ? `<i>${info.label}</i><sub>${info.sub}</sub>` : `<i>${info.label}</i>`;
      lines.push(`<tr><td>|${symbol}| <span class="vec-desc">${info.desc}</span></td>`
        + `<td>${fmtSig(ref.mod, 6)}</td><td>${fmtSig(norm(e.vec[name]), 6)}</td><td>${diff === 0 ? "0" : fmtSci(diff, 1)}</td></tr>`);
    }
    valuesBody.innerHTML = lines.join("");

    rowsBody.replaceChildren();
    let allOk = true;
    for (const check of entry.checagens) {
      const js = checks[check.chave];
      const ok = Number.isFinite(js) && Math.abs(js) <= check.tolerancia;
      allOk &&= ok && check.aprovado;
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="desc"></td><td class="${check.aprovado ? "ok" : "bad"}">${fmtValue(check.valor)}</td>`
        + `<td class="${ok ? "ok" : "bad"}">${fmtValue(js)}</td><td>≤ ${fmtSci(check.tolerancia, 0)}</td>`;
      texMixed(tr.querySelector(".desc"), check.descricao);
      rowsBody.append(tr);
    }
    status.textContent = `${entry.titulo}: recalculado em ${fmt(elapsed, 0)} ms. Maior diferença ${fmtSci(worst, 1)}. `
      + (allOk ? "Todas as verificações passam nos dois lados." : "Há verificação reprovada.");
  }

  const caseRoot = root.querySelector("[data-check-case]");
  caseRoot.innerHTML = report.casos.map((c, i) => `<button type="button" data-value="${c.numero}" aria-pressed="${i === 0}">${c.titulo}</button>`).join("");
  segmented(caseRoot, (value) => {
    entry = report.casos.find((c) => String(c.numero) === value);
    run();
  });
  root.querySelector("[data-check-run]").addEventListener("click", run);
  run();
}

function fmtValue(value) {
  if (!Number.isFinite(value)) return "–";
  if (value === 0) return "0";
  return (value < 0 ? "−" : "") + fmtSci(Math.abs(value), 1);
}
