import { createMotion } from "./model.js";
import { createHero } from "./hero.js";
import { createLab } from "./lab.js";
import { createSum } from "./sum.js";
import { createCoriolis } from "./coriolis.js";
import { createChecks } from "./checks.js";
import { invalidateTheme, segmented, theme } from "./ui.js";
import { applyStatic, lang, onLangChange, setLang, t } from "./i18n.js";

function setupTheme() {
  const toggle = document.querySelector("[data-theme-toggle]");
  const label = () => (toggle.textContent = t(theme().dark ? "theme.toLight" : "theme.toDark"));
  onLangChange(label);
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

async function main() {
  applyStatic();
  segmented(document.querySelector("[data-lang-toggle]"), (value) => value !== lang() && setLang(value));
  setupTheme();
  const report = await fetch("data/report.json").then((response) => response.json());
  const motions = Object.fromEntries(report.casos.map((c) => [String(c.numero), createMotion({ ...c.params })]));
  // Fonts change the canvas text metrics: redraw once they are in.
  document.fonts?.ready.then(() => invalidateTheme());

  createHero(document.getElementById("hero"), motions["3"]);
  const lab = createLab(report);
  createSum(report, lab, motions);
  createCoriolis(report, lab, motions);
  createChecks(report);
}

main();
