import sys
import os
import math
import subprocess
from pathlib import Path
from fractions import Fraction

try:
    import numpy as np
    import matplotlib
    import matplotlib.pyplot as plt
except Exception:
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "--user", "numpy", "matplotlib"]
    )
    import numpy as np
    import matplotlib
    import matplotlib.pyplot as plt

from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.animation import FuncAnimation, PillowWriter
from matplotlib.patches import Circle
from matplotlib.lines import Line2D

plt.rcParams.update(
    {
        "mathtext.fontset": "stix",
        "font.family": "STIXGeneral",
        "axes.grid": True,
        "grid.alpha": 0.25,
        "lines.linewidth": 1.2,
        "figure.facecolor": "white",
    }
)

palette = plt.rcParams["axes.prop_cycle"].by_key()["color"]

# ---------------------------------------------------------------------------
# Defaults (marked block)
# ---------------------------------------------------------------------------
DEFAULTS = {
    "R": 5.0,
    "r": 1.0,
    "RAZOES": [3.0, 4.0, 5.0, 3.5],
    "OMEGA": math.pi / 60.0,
    "INSTANTES": [10.0, 30.0, 50.0],
    "LAMBDAS": [-1.0, 0.5, 1.0],
}


# ---------------------------------------------------------------------------
# Input helpers
# ---------------------------------------------------------------------------
def ask_float(prompt, default, validator):
    while True:
        s = input(f"{prompt} [{default}]: ").strip()
        if s == "":
            return default
        try:
            v = float(s)
            if validator(v):
                return v
            print("Valor inválido.")
        except ValueError:
            print("Valor inválido.")


def ask_list(prompt, default, validator, cast=float):
    default_str = ", ".join(str(x) for x in default)
    while True:
        s = input(f"{prompt} [{default_str}]: ").strip()
        if s == "":
            return default
        try:
            vals = [cast(x.strip()) for x in s.split(",") if x.strip() != ""]
            if len(vals) > 0 and all(validator(v) for v in vals):
                return vals
            print("Valor inválido.")
        except ValueError:
            print("Valor inválido.")


def get_inputs():
    if sys.stdin.isatty():
        R = ask_float("R", DEFAULTS["R"], lambda v: v > 0)
        r = ask_float("r", DEFAULTS["r"], lambda v: v > 0)
        while R <= r:
            print("R deve ser maior que r.")
            R = ask_float("R", DEFAULTS["R"], lambda v: v > 0)
        RAZOES = ask_list("RAZOES", DEFAULTS["RAZOES"], lambda v: v > 1)
        OMEGA = ask_float("OMEGA", DEFAULTS["OMEGA"], lambda v: v > 0)
        INSTANTES = ask_list("INSTANTES", DEFAULTS["INSTANTES"], lambda v: v >= 0)
        LAMBDAS = ask_list("LAMBDAS", DEFAULTS["LAMBDAS"], lambda v: abs(v) > 1e-12)
    else:
        R = DEFAULTS["R"]
        r = DEFAULTS["r"]
        RAZOES = DEFAULTS["RAZOES"]
        OMEGA = DEFAULTS["OMEGA"]
        INSTANTES = DEFAULTS["INSTANTES"]
        LAMBDAS = DEFAULTS["LAMBDAS"]
    return R, r, RAZOES, OMEGA, INSTANTES, LAMBDAS


# ---------------------------------------------------------------------------
# Hypocycloid math (closed-form derivatives)
# ---------------------------------------------------------------------------
def hyp_params(R, r):
    k = (R - r) / r
    frac = Fraction(R / r).limit_denominator(100)
    p = frac.numerator
    q = frac.denominator
    theta_max = 2.0 * np.pi * q
    return k, p, q, theta_max


def hyp_xy(theta, R, r):
    k = (R - r) / r
    x = (R - r) * np.cos(theta) + r * np.cos(k * theta)
    y = (R - r) * np.sin(theta) - r * np.sin(k * theta)
    return x, y


def hyp_derivs(theta, R, r):
    k = (R - r) / r
    a = R - r
    x = a * np.cos(theta) + r * np.cos(k * theta)
    y = a * np.sin(theta) - r * np.sin(k * theta)
    xp = -a * np.sin(theta) - r * k * np.sin(k * theta)
    yp = a * np.cos(theta) - r * k * np.cos(k * theta)
    xpp = -a * np.cos(theta) - r * k * k * np.cos(k * theta)
    ypp = -a * np.sin(theta) + r * k * k * np.sin(k * theta)
    return x, y, xp, yp, xpp, ypp


def hyp_rho(theta, R, r):
    _, _, xp, yp, xpp, ypp = hyp_derivs(theta, R, r)
    denom = xp * ypp - yp * xpp
    return (xp * xp + yp * yp) ** 1.5 / np.abs(denom)


def hyp_tau_n(theta, R, r):
    _, _, xp, yp, xpp, ypp = hyp_derivs(theta, R, r)
    speed = np.hypot(xp, yp)
    tx = xp / speed
    ty = yp / speed
    denom = xp * ypp - yp * xpp
    s = np.sign(denom)
    nx = -s * yp / speed
    ny = s * xp / speed
    return tx, ty, nx, ny, denom, speed


def safe_points(R, r, p, q, n):
    c = 2.0 * np.pi * q * np.arange(p + 1) / p
    counts = [n // p + (1 if i < n % p else 0) for i in range(p)]
    pts = []
    for i in range(p):
        m = counts[i]
        if m > 0:
            a, b = c[i], c[i + 1]
            pts.extend(a + (b - a) * (np.arange(1, m + 1) / (m + 1)))
    return np.array(pts)


# ---------------------------------------------------------------------------
# Plot helpers
# ---------------------------------------------------------------------------
def make_table(ax, col_labels, cell_text, fontsize=9):
    ax.axis("off")
    table = ax.table(
        cellText=cell_text,
        colLabels=col_labels,
        loc="center",
        cellLoc="center",
        bbox=[0, 0, 1, 1],
    )
    table.auto_set_font_size(False)
    table.set_fontsize(fontsize)
    table.scale(1, 1.5)
    return table


def draw_snapshot(ax, theta, R, r, lw=1.2, ms=4):
    Cx = (R - r) * np.cos(theta)
    Cy = (R - r) * np.sin(theta)
    x, y = hyp_xy(theta, R, r)
    th_trace = np.linspace(0, theta, 200)
    xt, yt = hyp_xy(th_trace, R, r)
    ax.plot(xt, yt, color=palette[0], lw=lw)
    ax.add_patch(Circle((0, 0), R, fill=False, ls="--", color="gray", lw=0.8))
    ax.add_patch(Circle((Cx, Cy), r, fill=False, color=palette[1], lw=lw))
    ax.plot([Cx, x], [Cy, y], color=palette[2], lw=lw)
    ax.plot([x], [y], "o", color=palette[3], markersize=ms)
    ax.set_aspect("equal")
    lim = R + 1.0
    ax.set_xlim(-lim, lim)
    ax.set_ylim(-lim, lim)
    ax.grid(True, alpha=0.2)


def can_show():
    backend = matplotlib.get_backend().lower()
    if backend in ("agg", "pdf", "ps", "svg", "template", "cairo"):
        return False
    if sys.platform.startswith("linux"):
        if not (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")):
            return False
    return True


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    R, r, RAZOES, OMEGA, INSTANTES, LAMBDAS = get_inputs()
    k, p, q, theta_max = hyp_params(R, r)

    # Self-checks
    if abs(R - 2.0 * r) > 1e-12:
        th_chk = safe_points(R, r, p, q, 1)[0]
        rho_chk = float(hyp_rho(th_chk, R, r))
        assert rho_chk > 0
        tx, ty, nx, ny, _, _ = hyp_tau_n(th_chk, R, r)
        assert abs(tx * nx + ty * ny) < 1e-8

    lam0 = LAMBDAS[0]
    rp0 = np.array([1.0, 2.0 * lam0, 3.0 * lam0**2])
    rpp0 = np.array([0.0, 2.0, 6.0 * lam0])
    cross0 = np.cross(rp0, rpp0)
    tau0 = rp0 / np.linalg.norm(rp0)
    b0 = cross0 / np.linalg.norm(cross0)
    n0 = np.cross(b0, tau0)
    assert abs(np.dot(tau0, n0)) < 1e-8
    assert abs(np.dot(tau0, b0)) < 1e-8
    assert abs(np.dot(n0, b0)) < 1e-8
    assert np.allclose(b0, np.cross(tau0, n0), atol=1e-8)

    outdir = Path(__file__).parent
    pdf_path = outdir / "Tarefa5.pdf"
    gif_path = outdir / "hipocicloide.gif"

    theta = np.linspace(0.0, theta_max, 3000)
    x, y = hyp_xy(theta, R, r)

    with PdfPages(pdf_path) as pdf:
        # Page 1: Entradas
        fig = plt.figure(figsize=(8.27, 11.69))
        fig.suptitle("Entradas", fontsize=16)
        ax = fig.add_subplot(111)
        rows = [
            ["R", f"{R:.4g}"],
            ["r", f"{r:.4g}"],
            ["RAZOES", ", ".join(f"{v:.4g}" for v in RAZOES)],
            ["OMEGA", f"{OMEGA:.4g}"],
            ["INSTANTES", ", ".join(f"{v:.4g}" for v in INSTANTES)],
            ["LAMBDAS", ", ".join(f"{v:.4g}" for v in LAMBDAS)],
        ]
        make_table(ax, ["Parâmetro", "Valor"], rows, fontsize=11)
        pdf.savefig(fig)
        plt.close(fig)

        # 1.1
        fig = plt.figure(figsize=(8.27, 11.69))
        fig.suptitle("1.1 — Hipocicloide", fontsize=14)
        ax = fig.add_subplot(111)
        ax.plot(x, y, color=palette[0])
        ax.add_patch(Circle((0, 0), R, fill=False, ls="--", color="gray"))
        ax.set_aspect("equal")
        ax.set_xlim(-R - 1, R + 1)
        ax.set_ylim(-R - 1, R + 1)
        ax.grid(True, alpha=0.25)
        pdf.savefig(fig)
        plt.close(fig)

        # 1.2
        fig, axs = plt.subplots(3, 4, figsize=(8.27, 11.69))
        fig.suptitle("1.2 — Animação (quadros)", fontsize=14)
        thetas12 = np.linspace(0, theta_max, 12, endpoint=False)
        for ax, th in zip(axs.ravel(), thetas12):
            draw_snapshot(ax, th, R, r, lw=0.9, ms=3)
            ax.set_title(f"{th:.2f}", fontsize=7)
            ax.set_xticks([])
            ax.set_yticks([])
        plt.tight_layout(rect=[0, 0, 1, 0.95])
        pdf.savefig(fig)
        plt.close(fig)

        # 1.3
        fig, axs = plt.subplots(2, 3, figsize=(8.27, 11.69))
        fig.suptitle("1.3 — Instantâneos", fontsize=14)
        thetas13 = np.linspace(0, theta_max, 6, endpoint=False)
        for ax, th in zip(axs.ravel(), thetas13):
            draw_snapshot(ax, th, R, r, lw=1.2, ms=5)
            ax.set_title(f"θ = {th:.3f}", fontsize=9)
        plt.tight_layout(rect=[0, 0, 1, 0.95])
        pdf.savefig(fig)
        plt.close(fig)

        # 1.4
        fig, axs = plt.subplots(2, 2, figsize=(8.27, 11.69))
        fig.suptitle("1.4 — Várias razões R/r", fontsize=14)
        for ax, ratio in zip(axs.ravel(), RAZOES):
            rr = 1.0
            RR = ratio * rr
            _, _, _, tmax = hyp_params(RR, rr)
            th = np.linspace(0, tmax, 2000)
            xx, yy = hyp_xy(th, RR, rr)
            ax.plot(xx, yy, color=palette[0])
            ax.add_patch(Circle((0, 0), RR, fill=False, ls="--", color="gray"))
            ax.set_aspect("equal")
            ax.set_title(f"R/r = {ratio:.4g}", fontsize=10)
            ax.grid(True, alpha=0.25)
        plt.tight_layout(rect=[0, 0, 1, 0.95])
        pdf.savefig(fig)
        plt.close(fig)

        # 1.5
        fig = plt.figure(figsize=(8.27, 11.69))
        fig.suptitle("1.5 — Raio de curvatura", fontsize=14)
        ax_plot = fig.add_axes([0.1, 0.38, 0.8, 0.52])
        ax_plot.plot(x, y, color=palette[0])
        ax_plot.set_aspect("equal")
        ax_plot.grid(True, alpha=0.25)
        pts15 = safe_points(R, r, p, q, 6)
        x15, y15 = hyp_xy(pts15, R, r)
        rho15 = hyp_rho(pts15, R, r)
        ax_plot.plot(x15, y15, "o", color="red", markersize=5)
        ax_tab = fig.add_axes([0.1, 0.05, 0.8, 0.28])
        rows15 = [
            [f"{th:.4g}", f"{xx:.4g}", f"{yy:.4g}", f"{rr:.4g}"]
            for th, xx, yy, rr in zip(pts15, x15, y15, rho15)
        ]
        make_table(ax_tab, ["θ", "x", "y", "ρ"], rows15, fontsize=9)
        pdf.savefig(fig)
        plt.close(fig)

        # 1.6
        fig = plt.figure(figsize=(8.27, 11.69))
        fig.suptitle("1.6 — Tangente e normal", fontsize=14)
        ax = fig.add_subplot(111)
        ax.plot(x, y, color=palette[0])
        pts16 = safe_points(R, r, p, q, 8)
        xs16, ys16 = hyp_xy(pts16, R, r)
        tx, ty, nx, ny, _, _ = hyp_tau_n(pts16, R, r)
        ax.quiver(
            xs16,
            ys16,
            tx,
            ty,
            color="blue",
            angles="xy",
            scale_units="xy",
            scale=1,
            width=0.004,
            label="τ",
        )
        ax.quiver(
            xs16,
            ys16,
            nx,
            ny,
            color="red",
            angles="xy",
            scale_units="xy",
            scale=1,
            width=0.004,
            label="n",
        )
        ax.set_aspect("equal")
        ax.grid(True, alpha=0.25)
        ax.legend()
        pdf.savefig(fig)
        plt.close(fig)

        # 1.7
        fig = plt.figure(figsize=(8.27, 11.69))
        fig.suptitle("1.7 — Velocidade e aceleração", fontsize=14)
        ax_plot = fig.add_axes([0.1, 0.38, 0.8, 0.52])
        ax_plot.plot(x, y, color=palette[0])
        ax_plot.set_aspect("equal")
        ax_plot.grid(True, alpha=0.25)
        rows17 = []
        for t in INSTANTES:
            th = OMEGA * t
            th_plot = th % theta_max
            x0, y0, xp, yp, xpp, ypp = hyp_derivs(np.array([th]), R, r)
            x0, y0, xp, yp, xpp, ypp = (float(v[0]) for v in (x0, y0, xp, yp, xpp, ypp))
            vx = OMEGA * xp
            vy = OMEGA * yp
            ax_cart = OMEGA**2 * xpp
            ay_cart = OMEGA**2 * ypp
            speed = math.hypot(vx, vy)
            denom = xp * ypp - yp * xpp
            a_t = OMEGA**2 * (xp * xpp + yp * ypp) / math.hypot(xp, yp)
            a_n = OMEGA**2 * abs(denom) / math.hypot(xp, yp)
            rho = (xp * xp + yp * yp) ** 1.5 / abs(denom)
            rows17.append(
                [f"{t:.4g}", f"{speed:.4g}", f"{a_t:.4g}", f"{a_n:.4g}", f"{rho:.4g}"]
            )
            xp_plot, yp_plot = hyp_xy(np.array([th_plot]), R, r)
            ax_plot.plot(xp_plot, yp_plot, "o", color="black", markersize=5)
            ax_plot.quiver(
                xp_plot,
                yp_plot,
                vx,
                vy,
                color="blue",
                angles="xy",
                scale_units="xy",
                scale=1,
                width=0.004,
                label="v" if t == INSTANTES[0] else None,
            )
            ax_plot.quiver(
                xp_plot,
                yp_plot,
                ax_cart,
                ay_cart,
                color="red",
                angles="xy",
                scale_units="xy",
                scale=1,
                width=0.004,
                label="a" if t == INSTANTES[0] else None,
            )
        ax_plot.legend()
        ax_tab = fig.add_axes([0.1, 0.05, 0.8, 0.28])
        make_table(ax_tab, ["t", "|v|", "a_t", "a_n", "ρ"], rows17, fontsize=9)
        pdf.savefig(fig)
        plt.close(fig)

        # 2.1
        fig = plt.figure(figsize=(8.27, 11.69))
        fig.suptitle("2.1 — Curva espacial", fontsize=14)
        ax = fig.add_subplot(111, projection="3d")
        lam = np.linspace(-1.3, 1.3, 400)
        ax.plot(lam, lam**2, lam**3, color=palette[0])
        ax.set_xlabel("x")
        ax.set_ylabel("y")
        ax.set_zlabel("z")
        ax.set_box_aspect((1, 1, 1))
        ax.grid(True, alpha=0.25)
        pdf.savefig(fig)
        plt.close(fig)

        # 2.2
        fig = plt.figure(figsize=(8.27, 11.69))
        fig.suptitle("2.2 — Raio de curvatura", fontsize=14)
        ax = fig.add_subplot(111)
        rows22 = []
        for lam in LAMBDAS:
            P = (lam, lam**2, lam**3)
            rp = np.array([1.0, 2.0 * lam, 3.0 * lam**2])
            rpp = np.array([0.0, 2.0, 6.0 * lam])
            cross = np.cross(rp, rpp)
            rho = np.linalg.norm(rp) ** 3 / np.linalg.norm(cross)
            rows22.append(
                [
                    f"{lam:.4g}",
                    f"({P[0]:.4g}, {P[1]:.4g}, {P[2]:.4g})",
                    f"{rho:.4g}",
                ]
            )
        make_table(ax, ["λ", "P=(x,y,z)", "ρ"], rows22, fontsize=11)
        pdf.savefig(fig)
        plt.close(fig)

        # 2.3
        fig = plt.figure(figsize=(8.27, 11.69))
        fig.suptitle("2.3 — Triedro de Frenet", fontsize=14)
        ax = fig.add_subplot(111, projection="3d")
        ax.plot(lam, lam**2, lam**3, color="gray", alpha=0.6)
        for lam in LAMBDAS:
            P = np.array([lam, lam**2, lam**3])
            rp = np.array([1.0, 2.0 * lam, 3.0 * lam**2])
            rpp = np.array([0.0, 2.0, 6.0 * lam])
            cross = np.cross(rp, rpp)
            tau = rp / np.linalg.norm(rp)
            b = cross / np.linalg.norm(cross)
            n = np.cross(b, tau)
            for vec, col in ((tau, "blue"), (n, "red"), (b, "green")):
                ax.quiver(
                    P[0],
                    P[1],
                    P[2],
                    vec[0],
                    vec[1],
                    vec[2],
                    color=col,
                    length=0.4,
                    normalize=False,
                )
        handles = [
            Line2D([0], [0], color="blue", lw=2, label="τ"),
            Line2D([0], [0], color="red", lw=2, label="n"),
            Line2D([0], [0], color="green", lw=2, label="b"),
        ]
        ax.legend(handles=handles)
        ax.set_box_aspect((1, 1, 1))
        ax.grid(True, alpha=0.25)
        pdf.savefig(fig)
        plt.close(fig)

    # GIF
    fig, ax = plt.subplots(figsize=(6, 6))
    ax.set_aspect("equal")
    lim = R + 1.0
    ax.set_xlim(-lim, lim)
    ax.set_ylim(-lim, lim)
    ax.grid(True, alpha=0.25)
    ax.add_patch(Circle((0, 0), R, fill=False, ls="--", color="gray"))
    disk = Circle((0, 0), r, fill=False, color=palette[1])
    ax.add_patch(disk)
    (segment,) = ax.plot([], [], color=palette[2], lw=1.2)
    (point,) = ax.plot([], [], "o", color=palette[3], markersize=5)
    (trace,) = ax.plot([], [], color=palette[0], lw=1.2)

    theta_anim = np.linspace(0, theta_max, 150)
    x_anim, y_anim = hyp_xy(theta_anim, R, r)

    def update(i):
        th = theta_anim[i]
        Cx = (R - r) * np.cos(th)
        Cy = (R - r) * np.sin(th)
        xp, yp = x_anim[i], y_anim[i]
        disk.center = (Cx, Cy)
        segment.set_data([Cx, xp], [Cy, yp])
        point.set_data([xp], [yp])
        trace.set_data(x_anim[: i + 1], y_anim[: i + 1])
        return disk, segment, point, trace

    anim = FuncAnimation(
        fig, update, frames=len(theta_anim), blit=True, interval=1000 / 30
    )
    anim.save(gif_path, writer=PillowWriter(fps=30), dpi=110)
    plt.close(fig)

    print(f"PDF: {pdf_path.resolve()}")
    print(f"GIF: {gif_path.resolve()}")

    if can_show():
        fig, ax = plt.subplots(figsize=(6, 6))
        ax.plot(x, y, color=palette[0])
        ax.add_patch(Circle((0, 0), R, fill=False, ls="--", color="gray"))
        ax.set_aspect("equal")
        ax.grid(True, alpha=0.25)
        plt.show()


if __name__ == "__main__":
    main()
