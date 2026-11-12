import { createStudio } from "./studio.js";
import { createHero } from "./hero.js";
import { createInside } from "./inside.js";
import { createCurve } from "./curve.js";
import { createChecks } from "./checks.js";
import { engineVersion } from "./engine.js";
import { invalidateTheme, theme, toast, whenVisible } from "./ui.js";
import { TOOLS } from "./tools.js";

function setupTheme() {
  const toggle = document.querySelector("[data-theme-toggle]");
  const label = () => (toggle.textContent = theme().dark ? "Light" : "Dark");
  toggle.addEventListener("click", () => {
    const next = theme().dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("pixelsmith-theme", next);
    } catch {
      // Storage may be blocked; the choice then lasts for this visit.
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

function setupNav() {
  const links = [...document.querySelectorAll(".nav nav a")];
  const sections = links.map((a) => document.querySelector(a.getAttribute("href")));
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const i = sections.indexOf(entry.target);
        links.forEach((a, j) => a.classList.toggle("active", i === j));
      }
    },
    { rootMargin: "-40% 0px -55% 0px" },
  );
  sections.forEach((s) => s && observer.observe(s));
}

function setupCopy() {
  for (const button of document.querySelectorAll("[data-copy]")) {
    button.addEventListener("click", async () => {
      const code = button.closest(".code").querySelector("code").textContent;
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = "Copied";
        setTimeout(() => (button.textContent = "Copy"), 1500);
      } catch {
        toast("Copy failed: select the text instead.");
      }
    });
  }
}

async function facts() {
  document.querySelector("[data-fact='tools']").textContent = String(TOOLS.length);
  try {
    const version = await engineVersion();
    document.querySelector("[data-version]").textContent = `v${version}`;
    const entry = performance.getEntriesByType("resource").find((e) => e.name.endsWith("pixelsmith.wasm"));
    let size = entry?.decodedBodySize || entry?.transferSize;
    if (!size) {
      const response = await fetch("engine/pixelsmith.wasm", { method: "HEAD" });
      size = Number(response.headers.get("content-length"));
    }
    if (size) document.querySelector("[data-fact='engine']").textContent = String(Math.round(size / 1024));
  } catch {
    // Facts are decoration.
  }
}

async function main() {
  setupTheme();
  setupNav();
  setupCopy();
  document.fonts?.ready.then(() => invalidateTheme());

  const studio = createStudio(document.querySelector("[data-studio]"));
  const inside = createInside(document.getElementById("inside"), () => studio.image());
  const curve = createCurve(document.getElementById("curve"), () => studio.image());
  const checks = createChecks(document.getElementById("checks"));

  let curveShown = false;
  studio.onImage((image) => {
    inside.load(image);
    if (curveShown) curve.measure();
  });

  createHero(document.getElementById("hero"), { onReady: facts }).catch((error) => console.error(error));
  await studio.openSample("parrots");
  whenVisible(document.getElementById("curve"), () => {
    curveShown = true;
    curve.measure();
  });
  whenVisible(document.getElementById("checks"), () => checks.run(), "0px");
}

main();
