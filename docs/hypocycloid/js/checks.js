// 07 · The browser redoes the report: the table values and the checks of verificacao.py,
// compared with the numbers exported by codigo/site.py (data/report.json).

import { cubic, hypocycloid, instant, verify } from "./model.js";
import { checkDescription, onLangChange, t as tr } from "./i18n.js";
import { fmt, fmtSci, fmtSig, texMixed } from "./ui.js";

export function createChecks(report) {
  const root = document.getElementById("conferencia");
  const valuesBody = root.querySelector("[data-check-values]");
  const rowsBody = root.querySelector("[data-check-rows]");
  const status = root.querySelector("[data-check-status]");
  const e = report.entradas;

  function run() {
    const start = performance.now();
    const h = hypocycloid(e.R, e.r);
    const measures = verify(e.R, e.r, e.omega, e.lambdas);
    const elapsed = performance.now() - start;

    // Values: [label, report, browser]; the difference is relative to the value's size.
    const values = [[tr("check.length"), report.hipocicloide.comprimento, h.length]];
    report.rho.forEach((z, i) => values.push([tr("check.rhoPoint", { i: i + 1 }), z.rho, h.rhoClosed(z.theta)]));
    for (const z of report.instantes) {
      const b = instant(h, e.omega, z.t);
      values.push([tr("check.speedAt", { t: fmt(z.t, 0) }), z.rapidez, b.speed]);
      values.push([tr("check.atAt", { t: fmt(z.t, 0) }), z.a_t, b.at]);
      values.push([tr("check.anAt", { t: fmt(z.t, 0) }), z.a_n, b.an]);
    }
    for (const z of report.frenet) {
      const f = cubic.frenet(z.lambda);
      values.push([tr("check.rhoLambda", { l: fmt(z.lambda, 1) }), z.rho, f.rho]);
      values.push([tr("check.torsionLambda", { l: fmt(z.lambda, 1) }), z.torcao, f.torsion]);
    }
    let allOk = true;
    valuesBody.innerHTML = values.map(([name, py, js]) => {
      const diff = Math.abs(py - js) / Math.max(Math.abs(py), 1e-300);
      const ok = diff < 1e-9;
      allOk &&= ok;
      return `<tr><td>${name}</td><td>${fmtSig(py, 7)}</td><td>${fmtSig(js, 7)}</td><td class="${ok ? "ok" : "bad"}">${diff === 0 ? "0" : fmtSci(diff, 1)}</td></tr>`;
    }).join("");

    rowsBody.replaceChildren();
    for (const check of report.checagens) {
      const js = measures[check.chave];
      const ok = Number.isFinite(js) && js <= check.tolerancia;
      allOk &&= ok && check.aprovado;
      const row = document.createElement("tr");
      row.innerHTML = `<td class="desc"></td><td class="${check.aprovado ? "ok" : "bad"}">${fmtValue(check.valor)}</td>`
        + `<td class="${ok ? "ok" : "bad"}">${fmtValue(js)}</td><td>${fmtValue(check.tolerancia)}</td>`;
      texMixed(row.querySelector(".desc"), checkDescription(check.chave, check.descricao));
      rowsBody.append(row);
    }
    status.className = `status ${allOk ? "ok" : "bad"}`;
    status.textContent = allOk
      ? tr("check.ok", { n: values.length, m: report.checagens.length, ms: fmt(elapsed, 0) })
      : tr("check.fail");
  }

  const fmtValue = (x) => (x === 0 ? "0" : fmtSci(x, 1));

  root.querySelector("[data-check-run]").addEventListener("click", run);
  onLangChange(run);
  run();
}
