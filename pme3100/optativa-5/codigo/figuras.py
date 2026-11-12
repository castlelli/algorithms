"""Figuras do relatório (matplotlib). Cada função recebe os dados prontos e grava um PDF vetorial."""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np

from .estilo import CINZA, CINZA_CLARO, CORES, TINTA, aplicar_estilo, virgula
from .formatacao import mat
from .modelo import CurvaEspacial, Hipocicloide, Instante

import matplotlib.pyplot as plt  # noqa: E402  (estilo já fixou o backend Agg)
from matplotlib.patches import Circle, FancyArrowPatch  # noqa: E402

LARGURA = 16.0 / 2.54  # \textwidth do template (16 cm)


def _quadro(ax, h: Hipocicloide, folga: float = 1.08) -> None:  # noqa: ANN001
    L = folga * h.R
    ax.set(xlim=(-L, L), ylim=(-L, L), aspect="equal")
    ax.set_xticks([])
    ax.set_yticks([])
    ax.grid(False)
    for s in ax.spines.values():
        s.set_visible(False)


def _seta(ax, p0, d, cor: str, lw: float = 1.4, z: int = 6) -> None:  # noqa: ANN001
    p0 = np.asarray(p0, dtype=float)
    if np.linalg.norm(d) < 1e-9:
        return
    ax.add_patch(FancyArrowPatch(p0, p0 + d, arrowstyle="-|>", mutation_scale=9, lw=lw, color=cor, zorder=z,
                                 shrinkA=0, shrinkB=0))


def _curva(h: Hipocicloide, ate: float | None = None, n: int = 3000) -> np.ndarray:
    tm = h.theta_max if ate is None else ate
    return h.posicao(np.linspace(0, tm, max(2, int(n * max(tm, 1e-9) / h.theta_max) if h.fecha else n)))


def desenhar_instante(ax, h: Hipocicloide, theta: float, traco: bool = True, contato: bool = False,  # noqa: ANN001
                      lw: float = 1.3) -> None:
    """Aro, disco na posição θ, raio até P, P e (opcional) o traço já desenhado e o centro instantâneo."""
    ax.add_patch(Circle((0, 0), h.R, fill=False, ec=CORES["aro"], lw=0.9, ls=(0, (4, 3))))
    C = h.centro_disco(theta)
    P = h.posicao(theta)
    if traco and theta > 0:
        xy = _curva(h, theta)
        ax.plot(xy[:, 0], xy[:, 1], color=CORES["curva"], lw=lw)
    ax.add_patch(Circle(C, h.r, fill=False, ec=CORES["disco"], lw=lw))
    ax.plot([C[0], P[0]], [C[1], P[1]], color=CORES["disco"], lw=0.9)
    ax.plot(*C, "o", ms=2.2, color=CORES["disco"])
    if contato:
        I = h.contato(theta)
        ax.plot([I[0], P[0]], [I[1], P[1]], color=CINZA, lw=0.8, ls=(0, (2, 2)))
        ax.plot(*I, "o", ms=3.2, mfc="white", mec=TINTA, mew=0.9, zorder=7)
        v = h.d1(theta)
        if np.linalg.norm(v) > 1e-9:
            _seta(ax, P, 0.28 * h.R * v / np.linalg.norm(v), CORES["v"], lw=1.1)
    ax.plot(*P, "o", ms=4.2, color=CORES["ponto"], zorder=8)
    _quadro(ax, h)


def fig_curva(h: Hipocicloide, caminho: Path) -> None:
    """1.1: a curva fechada, o aro e os bicos."""
    aplicar_estilo()
    fig, ax = plt.subplots(figsize=(0.55 * LARGURA, 0.55 * LARGURA))
    ax.add_patch(Circle((0, 0), h.R, fill=False, ec=CORES["aro"], lw=0.9, ls=(0, (4, 3))))
    xy = _curva(h)
    ax.plot(xy[:, 0], xy[:, 1], color=CORES["curva"], lw=1.5)
    cusp = h.posicao(h.bicos()[:-1])
    ax.plot(cusp[:, 0], cusp[:, 1], "o", ms=3.5, mfc="white", mec=TINTA, mew=0.9, zorder=5)
    ax.plot(0, 0, "+", color=CINZA, ms=6)
    _quadro(ax, h)
    fig.savefig(caminho, bbox_inches="tight", pad_inches=0.02)
    plt.close(fig)


def fig_quadros(h: Hipocicloide, thetas: np.ndarray, caminho: Path, colunas: int, contato: bool) -> None:
    """1.2 e 1.3: instantâneos do processo de geração."""
    aplicar_estilo()
    linhas = math.ceil(len(thetas) / colunas)
    lado = LARGURA / colunas
    fig, axs = plt.subplots(linhas, colunas, figsize=(LARGURA, lado * linhas * 1.08))
    for ax, th in zip(np.ravel(axs), thetas):
        desenhar_instante(ax, h, float(th), contato=contato, lw=1.1 if colunas > 3 else 1.3)
        ax.set_title(rf"$\theta = {mat(th, 3)}$ rad", fontsize=8.5 if colunas > 3 else 9.5, pad=2)
    for ax in np.ravel(axs)[len(thetas):]:
        ax.axis("off")
    fig.subplots_adjust(wspace=0.04, hspace=0.18, left=0.01, right=0.99, top=0.95, bottom=0.01)
    fig.savefig(caminho)
    plt.close(fig)


def fig_razoes(razoes: tuple[float, ...], caminho: Path) -> None:
    """1.4: uma hipocicloide para cada razão R/r (r = 1)."""
    aplicar_estilo()
    colunas = 2 if len(razoes) <= 4 else 3
    linhas = math.ceil(len(razoes) / colunas)
    lado = LARGURA / colunas
    fig, axs = plt.subplots(linhas, colunas, figsize=(LARGURA, lado * linhas * 0.98))
    for ax, k in zip(np.ravel(axs), razoes):
        h = Hipocicloide(k, 1.0)
        ax.add_patch(Circle((0, 0), h.R, fill=False, ec=CORES["aro"], lw=0.8, ls=(0, (4, 3))))
        tm = h.theta_max if h.fecha else 2 * math.pi * 12
        xy = h.posicao(np.linspace(0, tm, 4000))
        ax.plot(xy[:, 0], xy[:, 1], color=CORES["curva"], lw=1.2)
        sub = rf"$p = {h.p}$ bicos, fecha em $q = {h.q}$ volta{'s' if h.q > 1 else ''}" if h.fecha else "não fecha"
        ax.set_title(rf"$R/r = {mat(k, 4)}$" + "\n" + sub, fontsize=9, pad=3)
        _quadro(ax, h)
    for ax in np.ravel(axs)[len(razoes):]:
        ax.axis("off")
    fig.subplots_adjust(wspace=0.05, hspace=0.25, left=0.01, right=0.99, top=0.92, bottom=0.01)
    fig.savefig(caminho)
    plt.close(fig)


def fig_rho(h: Hipocicloide, thetas: np.ndarray, caminho: Path) -> None:
    """1.5: pontos escolhidos com os círculos osculadores, e ρ(θ) ao longo de um período."""
    aplicar_estilo()
    fig, (ax, ax2) = plt.subplots(1, 2, figsize=(LARGURA, 0.47 * LARGURA),
                                  gridspec_kw={"width_ratios": [1, 1.25], "wspace": 0.22})
    xy = _curva(h)
    ax.plot(xy[:, 0], xy[:, 1], color=CORES["curva"], lw=1.3)
    ax.add_patch(Circle((0, 0), h.R, fill=False, ec=CORES["aro"], lw=0.8, ls=(0, (4, 3))))
    if not h.degenerada:
        C = h.centro_curvatura(thetas)
        rho = h.rho_fechado(thetas)
        for c, rr in zip(C, rho):
            ax.add_patch(Circle(c, rr, fill=False, ec=CORES["rho"], lw=0.8, alpha=0.75))
    P = h.posicao(thetas)
    ax.plot(P[:, 0], P[:, 1], "o", ms=3.8, color=CORES["ponto"], zorder=6)
    for i, p in enumerate(P, 1):
        ax.annotate(str(i), p, xytext=(4, 4), textcoords="offset points", fontsize=8, color=TINTA)
    lim = 1.08 * max(h.R, float(np.max(np.abs(h.centro_curvatura(thetas)))) if not h.degenerada else h.R)
    ax.set(xlim=(-lim, lim), ylim=(-lim, lim), aspect="equal")
    ax.set_xticks([]); ax.set_yticks([]); ax.grid(False)  # noqa: E702
    for s in ax.spines.values():
        s.set_visible(False)

    th = np.linspace(0, h.theta_max, 2000)
    ax2.plot(th, h.rho_fechado(th), color=CORES["rho"], lw=1.3)
    ax2.plot(thetas, h.rho_fechado(thetas), "o", ms=3.8, color=CORES["ponto"], zorder=5)
    for b in h.bicos():
        ax2.axvline(b, color=CINZA_CLARO, lw=0.7, zorder=0)
    ax2.set(xlabel=r"$\theta$ [rad]", ylabel=r"$\rho$", xlim=(0, h.theta_max))
    ax2.set_ylim(bottom=0)
    virgula(ax2)
    fig.savefig(caminho, bbox_inches="tight", pad_inches=0.02)
    plt.close(fig)


def fig_versores(h: Hipocicloide, thetas: np.ndarray, caminho: Path) -> None:
    """1.6: τ e n em pontos da curva (comprimento fixo, uma fração de R)."""
    aplicar_estilo()
    fig, ax = plt.subplots(figsize=(0.6 * LARGURA, 0.6 * LARGURA))
    xy = _curva(h)
    ax.plot(xy[:, 0], xy[:, 1], color=CORES["curva"], lw=1.3)
    ax.add_patch(Circle((0, 0), h.R, fill=False, ec=CORES["aro"], lw=0.8, ls=(0, (4, 3))))
    tau, n = h.tangente_normal(thetas)
    P = h.posicao(thetas)
    L = 0.16 * h.R
    for p, t_, n_ in zip(P, tau, n):
        _seta(ax, p, L * t_, CORES["tau"])
        if not h.degenerada:
            _seta(ax, p, L * n_, CORES["n"])
        ax.plot(*p, "o", ms=2.8, color=TINTA, zorder=7)
    ax.plot([], [], color=CORES["tau"], lw=2, label=r"$\boldsymbol{\tau}$ (tangente)")
    ax.plot([], [], color=CORES["n"], lw=2, label=r"$\mathbf{n}$ (normal principal)")
    ax.legend(loc="upper center", fontsize=9, bbox_to_anchor=(0.5, 0.0), ncol=2)
    _quadro(ax, h, 1.12)
    fig.savefig(caminho, bbox_inches="tight", pad_inches=0.02)
    plt.close(fig)


def escalas_cinematicas(h: Hipocicloide, omega: float) -> tuple[float, float]:
    """Comprimento de seta por unidade de |v| e de |a|: o maior vetor do período vale 0,3R."""
    th = np.linspace(0, h.theta_max, 4000)
    vmax = omega * float(np.max(np.linalg.norm(h.d1(th), axis=-1)))
    amax = omega**2 * float(np.max(np.linalg.norm(h.d2(th), axis=-1)))
    return 0.3 * h.R / vmax, 0.3 * h.R / amax


def fig_lei(h: Hipocicloide, omega: float, inst: list[Instante], caminho: Path) -> None:
    """1.7: P nos instantes pedidos, com v e a (e a decomposição a_t τ + a_n n)."""
    aplicar_estilo()
    ev, ea = escalas_cinematicas(h, omega)
    fig, ax = plt.subplots(figsize=(0.62 * LARGURA, 0.62 * LARGURA))
    xy = _curva(h)
    ax.plot(xy[:, 0], xy[:, 1], color=CORES["curva"], lw=1.2, alpha=0.85)
    ax.add_patch(Circle((0, 0), h.R, fill=False, ec=CORES["aro"], lw=0.8, ls=(0, (4, 3))))
    for e in inst:
        P = e.posicao
        _seta(ax, P, ea * e.a_t * e.tau, CORES["a_t"], lw=1.0, z=5)
        _seta(ax, P, ea * e.a_n * e.n, CORES["a_n"], lw=1.0, z=5)
        _seta(ax, P, ea * e.a, CORES["a"], lw=1.5)
        _seta(ax, P, ev * e.v, CORES["v"], lw=1.5)
        ax.plot(*P, "o", ms=3.8, color=TINTA, zorder=8)
        ax.annotate(rf"$t = {mat(e.t, 3)}$ s", P, xytext=(-8, -12), textcoords="offset points",
                    fontsize=8.5, color=TINTA, ha="right")
    for nome, rot in (("v", r"$\mathbf{v}$"), ("a", r"$\mathbf{a}$"), ("a_t", r"$a_t\boldsymbol{\tau}$"),
                      ("a_n", r"$a_n\mathbf{n}$")):
        ax.plot([], [], color=CORES[nome], lw=2, label=rot)
    ax.legend(loc="upper center", fontsize=9, bbox_to_anchor=(0.5, 0.0), ncol=4)
    _quadro(ax, h, 1.12)
    fig.savefig(caminho, bbox_inches="tight", pad_inches=0.02)
    plt.close(fig)


def _eixos3d(ax) -> None:  # noqa: ANN001
    ax.set_xlabel("$x$", labelpad=-6)
    ax.set_ylabel("$y$", labelpad=-6)
    ax.set_zlabel("$z$", labelpad=-6)
    ax.tick_params(labelsize=7, pad=-2)
    ax.set_aspect("equal")  # escalas iguais: senão τ, n e b não parecem ortogonais
    ax.view_init(elev=22, azim=-58)
    for eixo in (ax.xaxis, ax.yaxis, ax.zaxis):
        eixo.pane.set_facecolor((1, 1, 1, 0))
        eixo.pane.set_edgecolor(CINZA_CLARO)


def fig_espacial(lambdas: tuple[float, ...], caminho: Path, frenet: bool) -> None:
    """2.1 (só a curva e os pontos) e 2.3 (com τ, n, b em cada ponto)."""
    aplicar_estilo()
    fig = plt.figure(figsize=(0.62 * LARGURA, 0.62 * LARGURA))
    ax = fig.add_subplot(111, projection="3d")
    lmax = max(1.3, 1.1 * max(abs(l) for l in lambdas))
    lam = np.linspace(-lmax, lmax, 600)
    xyz = CurvaEspacial.posicao(lam)
    ax.plot(*xyz.T, color=CORES["curva"], lw=1.4, alpha=0.6 if frenet else 1)
    L = 0.6
    for l in lambdas:
        f = CurvaEspacial.frenet(l)
        ax.scatter(*f.posicao, color=TINTA, s=10, depthshade=False)
        if frenet:
            for vec, cor in ((f.tau, CORES["tau"]), (f.n, CORES["n"]), (f.b, CORES["b"])):
                ax.quiver(*f.posicao, *(L * vec), color=cor, lw=1.6, arrow_length_ratio=0.22)
        ax.text(*(f.posicao + np.array([0.1, 0, 0.25 if l > 0 else -0.45])), rf"$\lambda = {mat(l, 3)}$", fontsize=8, color=TINTA)
    if frenet:
        for nome, rot in (("tau", r"$\boldsymbol{\tau}$"), ("n", r"$\mathbf{n}$"), ("b", r"$\mathbf{b}$")):
            ax.plot([], [], color=CORES[nome], lw=2, label=rot)
        ax.legend(loc="upper left", fontsize=9)
    _eixos3d(ax)
    fig.savefig(caminho, bbox_inches="tight", pad_inches=0.12)
    plt.close(fig)
