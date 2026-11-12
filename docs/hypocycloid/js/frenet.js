// 06 · The twisted cubic and its Frenet frame (items 2.1–2.3), in a small hand-written
// orthographic 3D view: drag to rotate, shadows on three coordinate planes.

import { add, cubic, scale } from "./model.js";
import { onLangChange, t as tr } from "./i18n.js";
import { arrow, crisp, dot2, drag, fmt, fmtSig, fmtVec, label, loop, polyline, reducedMotion, segmented, slider, theme, toggle, withAlpha } from "./ui.js";

const L_MAX = 1.3;
const BOX = { x: [-1.5, 1.5], y: [-0.2, 2], z: [-2.4, 2.4] };
const VIEWS = {
  iso: { yaw: -0.85, pitch: 0.38 },
  xy: { yaw: 0, pitch: Math.PI / 2 - 1e-3 },
  xz: { yaw: 0, pitch: 0 },
  yz: { yaw: -Math.PI / 2, pitch: 0 },
};
const ARROW = 0.75;

export function createFrenet(report) {
  const root = document.getElementById("frenet");
  const canvas = document.getElementById("frenet-scene");
  const readout = root.querySelector("[data-frenet-readout]");
  const output = root.querySelector("[data-frenet-out]");
  const playButton = root.querySelector("[data-frenet-play]");
  const tableBody = root.querySelector("[data-frenet-table]");
  const show = { plane: true, shadows: true, points: true };
  const lambdas = report.entradas.lambdas;
  let lam = 0.5;
  let dir = 1;
  let playing = !reducedMotion();
  const cam = { ...VIEWS.iso };
  let goal = null; // animated change of view

  // Orthographic projection: yaw about z, then pitch; returns [sx, sy, depth] in world units.
  const project = (p) => {
    const [x, y, z] = [p[0], p[1] - 0.9, p[2]];
    const ca = Math.cos(cam.yaw);
    const sa = Math.sin(cam.yaw);
    const xr = x * ca - y * sa;
    const yr = x * sa + y * ca;
    const cp = Math.cos(cam.pitch);
    const sp = Math.sin(cam.pitch);
    return [xr, z * cp + yr * sp, yr * cp - z * sp];
  };

  const view = crisp(canvas, (ctx, w, hgt) => {
    const t = theme();
    const s = Math.min(w, hgt) / 6.1;
    const pt = (p) => {
      const [X, Y] = project(p);
      return [w / 2 + X * s, hgt / 2 - Y * s];
    };
    const line3 = (pts) => polyline(ctx, pts.map(pt));

    // Box planes with a light grid: floor z = zmin, back wall y = ymax, side wall x = xmin.
    ctx.save();
    ctx.strokeStyle = t.grid2;
    ctx.lineWidth = 1;
    for (let g = BOX.x[0]; g <= BOX.x[1] + 1e-9; g += 0.5) {
      line3([[g, BOX.y[0], BOX.z[0]], [g, BOX.y[1], BOX.z[0]]]);
      ctx.stroke();
      line3([[g, BOX.y[1], BOX.z[0]], [g, BOX.y[1], BOX.z[1]]]);
      ctx.stroke();
    }
    for (let g = 0; g <= BOX.y[1] + 1e-9; g += 0.5) {
      line3([[BOX.x[0], g, BOX.z[0]], [BOX.x[1], g, BOX.z[0]]]);
      ctx.stroke();
      line3([[BOX.x[0], g, BOX.z[0]], [BOX.x[0], g, BOX.z[1]]]);
      ctx.stroke();
    }
    for (let g = -2; g <= 2 + 1e-9; g += 1) {
      line3([[BOX.x[0], BOX.y[1], g], [BOX.x[1], BOX.y[1], g]]);
      ctx.stroke();
      line3([[BOX.x[0], BOX.y[0], g], [BOX.x[0], BOX.y[1], g]]);
      ctx.stroke();
    }
    ctx.restore();

    // Axes labels at the far ends of the box edges.
    ctx.font = `italic 600 13px ${t.sans}`;
    ctx.fillStyle = t.ink3;
    for (const [p, txt] of [[[BOX.x[1] + 0.15, BOX.y[0], BOX.z[0]], "x"], [[BOX.x[0], BOX.y[1] + 0.2, BOX.z[0]], "y"], [[BOX.x[0], BOX.y[1], BOX.z[1] + 0.2], "z"]]) {
      const [X, Y] = pt(p);
      ctx.fillText(txt, X - 4, Y + 4);
    }

    const ls = Array.from({ length: 241 }, (_, i) => -L_MAX + (2 * L_MAX * i) / 240);
    if (show.shadows) {
      ctx.save();
      ctx.strokeStyle = withAlpha(t.c.curve, 0.32);
      ctx.lineWidth = 1.4;
      line3(ls.map((l) => [l, l * l, BOX.z[0]]));
      ctx.stroke();
      line3(ls.map((l) => [l, BOX.y[1], l ** 3]).filter((p) => Math.abs(p[2]) <= BOX.z[1]));
      ctx.stroke();
      line3(ls.map((l) => [BOX.x[0], l * l, l ** 3]).filter((p) => Math.abs(p[2]) <= BOX.z[1]));
      ctx.stroke();
      ctx.restore();
    }

    // The curve, thicker where it is nearer.
    for (let i = 0; i + 1 < ls.length; i++) {
      const p0 = cubic.pos(ls[i]);
      const p1 = cubic.pos(ls[i + 1]);
      const d = project(p0)[2];
      ctx.strokeStyle = t.c.curve;
      ctx.lineWidth = 2.6 - 0.35 * Math.max(-1.5, Math.min(1.5, d));
      ctx.lineCap = "round";
      line3([p0, p1]);
      ctx.stroke();
    }

    const drawFrame = (l, main) => {
      const f = cubic.frenet(l);
      const [px, py] = pt(f.pos);
      if (main && show.plane) {
        const c = 0.9;
        const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => add(f.pos, add(scale(f.tau, a * c), scale(f.n, b * c))));
        ctx.save();
        ctx.fillStyle = withAlpha(t.c.rho, t.dark ? 0.16 : 0.1);
        ctx.strokeStyle = withAlpha(t.c.rho, 0.5);
        ctx.lineWidth = 1;
        line3(corners);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Osculating circle: centre P + ρn, in the plane of τ and n.
        const C = add(f.pos, scale(f.n, f.rho));
        const circle = Array.from({ length: 181 }, (_, i) => {
          const a = (2 * Math.PI * i) / 180;
          return add(C, add(scale(f.tau, f.rho * Math.cos(a)), scale(f.n, -f.rho * Math.sin(a))));
        });
        ctx.strokeStyle = t.c.rho;
        ctx.lineWidth = 1.3;
        ctx.setLineDash([4, 3]);
        line3(circle);
        ctx.stroke();
        ctx.restore();
      }
      const L = main ? ARROW : 0.45;
      const order = [["b", f.b], ["n", f.n], ["tau", f.tau]].sort((u, v) => project(u[1])[2] - project(v[1])[2]);
      for (const [name, vec] of order) {
        const [qx, qy] = pt(add(f.pos, scale(vec, L)));
        arrow(ctx, px, py, qx, qy, t.c[name], main ? 2.6 : 1.6, main ? 1 : 0.8);
        if (main) {
          const [lx, ly] = pt(add(f.pos, scale(vec, L + 0.16)));
          label(ctx, name === "tau" ? "τ" : name, "", lx - 4, ly, t.c[name], 15, true);
        }
      }
      dot2(ctx, px, py, main ? 5 : 3.2, main ? t.c.pen : t.ink, t.surface, 1.4);
    };
    if (show.points) for (const l of lambdas) drawFrame(l, false);
    drawFrame(lam, true);
  });

  const renderReadout = () => {
    const f = cubic.frenet(lam);
    const rows = [
      ["P", fmtVec(f.pos, 3)],
      [tr("frenet.kappa"), fmtSig(f.kappa, 4)],
      ["ρ = 1/κ", fmtSig(f.rho, 4)],
      [tr("frenet.torsion"), fmtSig(f.torsion, 4)],
      ["τ", fmtVec(f.tau, 3)],
      ["n", fmtVec(f.n, 3)],
      ["b", fmtVec(f.b, 3)],
    ];
    readout.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
    output.textContent = fmt(lam, 3);
  };

  const renderTable = () => {
    tableBody.innerHTML = lambdas.map((l) => {
      const f = cubic.frenet(l);
      return `<tr><td>${fmt(l, 2)}</td><td>${fmtVec(f.pos, 3)}</td><td>${fmtSig(f.rho, 5)}</td><td>${fmtSig(f.torsion, 4)}</td>`
        + `<td>${fmtVec(f.tau, 4)}</td><td>${fmtVec(f.n, 4)}</td><td>${fmtVec(f.b, 4)}</td></tr>`;
    }).join("");
  };

  const redraw = () => {
    view.redraw();
    renderReadout();
  };

  const lSlider = slider(document.getElementById("frenet-l"), (value) => {
    lam = value;
    setPlaying(false);
    redraw();
  });

  const views = segmented(root.querySelector("[data-frenet-view]"), (value) => {
    goal = { ...VIEWS[value] };
    if (reducedMotion()) {
      Object.assign(cam, goal);
      goal = null;
    }
    anim.kick();
    redraw();
  });
  let last = null;
  drag(canvas, (x, y) => {
    if (last) {
      cam.yaw += (x - last[0]) * 0.012;
      cam.pitch = Math.max(-1.45, Math.min(1.5707, cam.pitch + (y - last[1]) * 0.012));
      goal = null;
      views.set("", false);
      redraw();
    }
    last = [x, y];
  }, () => (last = null));

  const label2 = () => (playButton.textContent = tr(playing ? "lab.pause" : "lab.play"));
  const setPlaying = (on) => {
    playing = on;
    label2();
    if (on) anim.kick();
  };
  playButton.addEventListener("click", () => setPlaying(!playing));

  const anim = loop(canvas, () => playing || goal !== null, (dt) => {
    if (playing) {
      lam += dir * 0.35 * dt;
      if (Math.abs(lam) > L_MAX) {
        dir = -dir;
        lam = Math.sign(lam) * L_MAX;
      }
      lSlider.set(lam);
    }
    if (goal) {
      const k = Math.min(1, dt * 6);
      cam.yaw += (goal.yaw - cam.yaw) * k;
      cam.pitch += (goal.pitch - cam.pitch) * k;
      if (Math.abs(goal.yaw - cam.yaw) + Math.abs(goal.pitch - cam.pitch) < 1e-3) {
        Object.assign(cam, goal);
        goal = null;
      }
    }
    redraw();
  });

  for (const button of root.querySelectorAll("[data-frenet-toggle]")) {
    toggle(button, (on) => {
      show[button.dataset.frenetToggle] = on;
      redraw();
    });
  }

  onLangChange(() => {
    label2();
    renderReadout();
    renderTable();
  });
  label2();
  renderTable();
  redraw();
}
