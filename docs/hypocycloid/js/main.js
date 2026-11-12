import { createStore, createLab } from "./lab.js";
import { createHero } from "./hero.js";
import { createGallery } from "./gallery.js";
import { createCurvature } from "./curvature.js";
import { createFrame } from "./frame.js";
import { createMotion } from "./motion.js";
import { createFrenet } from "./frenet.js";
import { createChecks } from "./checks.js";
import { invalidateTheme, renderStaticTex, segmented, theme } from "./ui.js";
import { applyStatic, lang, onLangChange, setLang, t } from "./i18n.js";

function setupTheme() {
  const button = document.querySelector("[data-theme-toggle]");
  const label = () => (button.textContent = t(theme().dark ? "theme.toLight" : "theme.toDark"));
  onLangChange(label);
  button.addEventListener("click", () => {
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

/** KaTeX loads with defer; render the static formulas once it is there. */
function whenKatex(callback, tries = 40) {
  if (window.katex) callback();
  else if (tries > 0) setTimeout(() => whenKatex(callback, tries - 1), 100);
  else callback();
}

async function main() {
  applyStatic();
  segmented(document.querySelector("[data-lang-toggle]"), (value) => value !== lang() && setLang(value));
  setupTheme();
  const report = await fetch("data/report.json").then((response) => response.json());
  // Fonts change the canvas text metrics: redraw once they are in.
  document.fonts?.ready.then(() => invalidateTheme());

  const store = createStore(report.entradas.R, report.entradas.r);
  createHero(document.getElementById("hero"));
  createLab(store);
  createGallery(report);
  createCurvature(store, report);
  createFrame(store);
  createMotion(store, report);
  createFrenet(report);
  whenKatex(() => {
    renderStaticTex();
    createChecks(report);
  });
}

main();
