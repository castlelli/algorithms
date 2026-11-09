import { createLab } from "./lab.js";
import { createCloud } from "./cloud.js";
import { createButterfly } from "./butterfly.js";
import { createBifurcation } from "./bifurcation.js";
import { createBasins } from "./basins.js";
import { createPrecision } from "./precision.js";
import { fmt, invalidateTheme, reducedMotion, theme } from "./ui.js";
import { STEPS_PER_PERIOD } from "./model.js";

function setupTheme() {
  const toggle = document.querySelector("[data-theme-toggle]");
  const label = () => (toggle.textContent = theme().dark ? "Tema claro" : "Tema escuro");
  toggle.addEventListener("click", () => {
    const next = theme().dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch (error) {
      // Storage can be blocked; the choice then lasts for this visit only.
    }
    invalidateTheme();
    label();
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    invalidateTheme();
    label();
  });
  label();
}

function setupAttractor(report, seed, lab) {
  const root = document.getElementById("atrator");
  const slider = root.querySelector("#cloud-phase");
  const label = root.querySelector("[data-cloud-phase-label]");
  const play = root.querySelector("[data-cloud-play]");
  const note = root.querySelector("[data-cloud-note]");
  const caseC = report.cases.C;
  let caseKey = "C";
  const cloud = createCloud(root.querySelector("#cloud"), {
    seed,
    params: caseC,
    axes: true,
    color: () => (caseKey ? theme().cases[caseKey] : theme().free),
  });
  const describe = (text) => (note.textContent = text);
  const syncPlay = () => (play.textContent = cloud.isPlaying() ? "Parar" : "Girar a fase");

  cloud.onPhase((phase) => {
    slider.value = String(phase);
    slider.style.setProperty("--fill", `${(phase / (STEPS_PER_PERIOD - 1)) * 100}%`);
    label.textContent = `${fmt(phase / STEPS_PER_PERIOD, 2)} T`;
  });
  slider.addEventListener("input", () => {
    cloud.seekPhase(Number(slider.value));
    syncPlay();
  });
  play.addEventListener("click", () => {
    cloud.setPlaying(!cloud.isPlaying());
    syncPlay();
  });
  root.querySelector("[data-cloud-lab]").addEventListener("click", () => {
    const snapshot = lab.snapshot();
    if (!(snapshot.params.omega > 0)) return describe("Estes dados não têm força periódica para marcar a fase.");
    caseKey = snapshot.caseKey;
    cloud.setSystem(snapshot.params);
    cloud.setPlaying(true);
    syncPlay();
    describe("Os 60 mil blocos partem espalhados pela janela e caem sobre os atratores dos dados do laboratório. Se sobrarem poucos pontos, o movimento é periódico.");
  });
  root.querySelector("[data-cloud-reset]").addEventListener("click", () => {
    caseKey = "C";
    cloud.setSystem(caseC, seed);
    cloud.setPlaying(false);
    syncPlay();
    describe("Caso C: k₁ = −1 N/m, A = 0,50 N. Os pontos de partida vêm do relatório; a evolução é calculada aqui.");
  });
  describe("Caso C: k₁ = −1 N/m, A = 0,50 N. Os pontos de partida vêm do relatório; a evolução é calculada aqui.");
  slider.style.setProperty("--fill", "0%");
}

async function main() {
  setupTheme();
  const [report, seedBuffer] = await Promise.all([
    fetch("data/report.json").then((response) => response.json()),
    fetch("data/attractor_c.bin").then((response) => response.arrayBuffer()),
  ]);
  const seed = new Float32Array(seedBuffer);

  const lab = createLab(report);
  createCloud(document.getElementById("hero-cloud"), {
    seed,
    params: report.cases.C,
    autoplay: !reducedMotion(),
    stepsPerFrame: 1,
    color: () => theme().cases.C,
  });
  setupAttractor(report, seed, lab);
  createButterfly(report, lab);
  createPrecision(report);
  await Promise.all([createBifurcation(report, lab), createBasins(report, lab)]);
}

main();
