"""Todas as figuras do relatório e os três gráficos pedidos pelo enunciado."""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.collections import LineCollection
from matplotlib.colors import ListedColormap
from matplotlib.gridspec import GridSpec
from matplotlib.lines import Line2D
from matplotlib.patches import Patch, Rectangle

from .casos import CASOS
from .estilo import (
    CINZA, CINZA_CLARO, COR_CASO, COR_FASE, LARGURA, POCO_DIR, POCO_ESQ, TINTA, TRANSIENTE,
    aplicar_estilo, rampa, virgula,
)
from .formatacao import mat
from .modelo import PASSOS_POR_PERIODO, Parametros, Trajetoria, integrar

XLIM, VLIM = (-2.1, 2.1), (-2.4, 2.4)


def _salvar(fig, destino: Path, nome: str) -> None:
    destino.mkdir(parents=True, exist_ok=True)
    fig.savefig(destino / f"{nome}.pdf")
    fig.savefig(destino / f"{nome}.png", dpi=170)
    plt.close(fig)


def _gradiente(ax, x, y, cor: str, lw: float = 0.55) -> None:
    """Linha cujo tom escurece com o tempo; rasterizada para o PDF continuar leve."""
    pontos = np.column_stack([x, y]).reshape(-1, 1, 2)
    seg = np.concatenate([pontos[:-1], pontos[1:]], axis=1)
    lc = LineCollection(seg, cmap=rampa(cor), linewidth=lw, capstyle="round", rasterized=True)
    lc.set_array(np.linspace(0, 1, len(seg)))
    ax.add_collection(lc)


def _equilibrios(ax, p: Parametros) -> None:
    """Equilíbrios da mola sem força: × para instável, círculo vazado para estável."""
    for x, autoval in p.equilibrios():
        instavel = np.max(autoval.real) > 0
        ax.plot(x, 0, marker="x" if instavel else "o", ms=4.5, mfc="white" if not instavel else "none",
                mec=TINTA, mew=0.9, ls="none", zorder=6)


def trio(p: Parametros, trajetorias: list[tuple[Trajetoria, str, str]], t_transiente: float | None = None,
         limites: bool = True, pontos: np.ndarray | None = None, rotulo_pontos: str | None = None,
         cor_base: str | None = None):
    """Os três gráficos pedidos, em um painel: x(t), ẋ(t) e o espaço de fases ẋ(x)."""
    fig = plt.figure(figsize=(LARGURA, 3.15))
    gs = GridSpec(2, 2, width_ratios=[1.42, 1], hspace=0.2, wspace=0.2,
                  left=0.065, right=0.99, top=0.925, bottom=0.125)
    ax_x = fig.add_subplot(gs[0, 0])
    ax_v = fig.add_subplot(gs[1, 0], sharex=ax_x)
    ax_f = fig.add_subplot(gs[:, 1])
    for tr, cor, rotulo in trajetorias:
        ax_x.plot(tr.t, tr.x, color=cor, lw=0.75, label=rotulo)
        ax_v.plot(tr.t, tr.v, color=cor, lw=0.75)
        if len(trajetorias) == 1:
            _gradiente(ax_f, tr.x, tr.v, cor)
        else:
            ax_f.plot(tr.x, tr.v, color=cor, lw=0.85)
        ax_f.plot(tr.x[0], tr.v[0], "o", ms=3.5, color=cor, mec="white", mew=0.5, zorder=7)
    if t_transiente:
        for ax in (ax_x, ax_v):
            ax.axvspan(0, t_transiente, color=TRANSIENTE, lw=0, zorder=0)
        ax_x.text(t_transiente / 2, 1.78, "transiente", ha="center", va="center", fontsize=7.5, color=TINTA)
    t_fim = trajetorias[0][0].t[-1]
    ax_x.set_xlim(0, t_fim)
    ax_x.set_ylabel(r"$x$ [m]")
    ax_v.set_ylabel(r"$\dot{x}$ [m/s]")
    ax_v.set_xlabel(r"$t$ [s]")
    ax_x.tick_params(labelbottom=False)
    ax_x.set_title(r"(a) $x(t)$", pad=9)
    ax_v.set_title(r"(b) $\dot{x}(t)$", pad=2)
    ax_f.set_title(r"(c) Espaço de fases $\dot{x}(x)$", pad=9)
    ax_f.set_xlabel(r"$x$ [m]")
    ax_f.set_ylabel(r"$\dot{x}$ [m/s]", labelpad=1)
    _equilibrios(ax_f, p)
    if pontos is not None:
        ax_f.plot(pontos[:, 0], pontos[:, 1], "o", ms=4.3, mfc=TINTA, mec="white", mew=0.6, zorder=8,
                  label=rotulo_pontos)
        ax_f.legend(loc="lower right", handletextpad=0.1, borderaxespad=0.1, fontsize=7.5)
    if limites:
        ax_f.set_xlim(XLIM)
        ax_f.set_ylim(VLIM)
        ax_x.set_ylim(XLIM)
        ax_v.set_ylim(VLIM)
        for ax in (ax_x, ax_f):
            ax.set_yticks([-2, -1, 0, 1, 2])
        ax_v.set_yticks([-2, -1, 0, 1, 2])
        ax_f.set_xticks([-2, -1, 0, 1, 2])
    else:
        ax_f.autoscale_view()
    for ax in (ax_x, ax_v, ax_f):
        virgula(ax)
    return fig


def graficos_do_enunciado(p: Parametros, tr: Trajetoria, destino: Path) -> list[Path]:
    """Saída da linha de comando: os gráficos (a), (b) e (c) separados e o painel conjunto."""
    aplicar_estilo()
    destino.mkdir(parents=True, exist_ok=True)
    cor = COR_CASO["A"]
    arquivos = []
    for nome, xs, ys, rx, ry in (("a_x_t", tr.t, tr.x, r"$t$ [s]", r"$x$ [m]"),
                                 ("b_v_t", tr.t, tr.v, r"$t$ [s]", r"$\dot{x}$ [m/s]"),
                                 ("c_espaco_de_fases", tr.x, tr.v, r"$x$ [m]", r"$\dot{x}$ [m/s]")):
        fig, ax = plt.subplots(figsize=(LARGURA, 3.0 if nome != "c_espaco_de_fases" else 4.5),
                               layout="constrained")
        ax.plot(xs, ys, color=cor, lw=0.8)
        ax.set_xlabel(rx)
        ax.set_ylabel(ry)
        virgula(ax)
        caminho = destino / f"{nome}.png"
        fig.savefig(caminho, dpi=220)
        plt.close(fig)
        arquivos.append(caminho)
    fig = trio(p, [(tr, cor, "")], limites=False)
    caminho = destino / "painel.png"
    fig.savefig(caminho, dpi=220)
    plt.close(fig)
    arquivos.append(caminho)
    return arquivos


def fig_potencial(destino: Path) -> None:
    fig, axes = plt.subplots(1, 2, figsize=(LARGURA, 2.05), sharex=True, layout="constrained")
    x = np.linspace(-2.0, 2.0, 500)
    for ax, k1, chave, titulo in ((axes[0], -1.0, "A", r"Poço duplo: $k_1=-1$ N/m (casos A, B, C e E)"),
                                  (axes[1], 1.0, "D", r"Poço único: $k_1=+1$ N/m (caso D)")):
        V = 0.5 * k1 * x**2 + 0.25 * x**4
        ax.plot(x, V, color=COR_CASO[chave], lw=1.5)
        ax.set_title(titulo)
        ax.set_xlabel(r"$x$ [m]")
        ax.set_ylabel(r"$V(x)$ [J]")
        ax.set_ylim(-0.6, 2.2)
        ax.set_xlim(-2, 2)
        virgula(ax)
    a = axes[0]
    a.plot([-1, 1], [-0.25, -0.25], "o", ms=5, mfc="white", mec=TINTA, mew=0.9, zorder=5)
    a.plot(0, 0, "x", ms=5, mec=TINTA, mew=1.0, zorder=5)
    a.annotate("estável", (1, -0.25), xytext=(0.72, 0.62), fontsize=8, color=TINTA, ha="center",
               arrowprops=dict(arrowstyle="-", color=CINZA, lw=0.5, shrinkB=3))
    a.annotate("estável", (-1, -0.25), xytext=(-0.72, 0.62), fontsize=8, color=TINTA, ha="center",
               arrowprops=dict(arrowstyle="-", color=CINZA, lw=0.5, shrinkB=3))
    a.annotate("instável", (0, 0), xytext=(0, 1.15), fontsize=8, color=TINTA, ha="center",
               arrowprops=dict(arrowstyle="-", color=CINZA, lw=0.5, shrinkB=3))
    b = axes[1]
    b.plot(0, 0, "o", ms=5, mfc="white", mec=TINTA, mew=0.9, zorder=5)
    b.annotate("estável", (0, 0), xytext=(0, 1.15), fontsize=8, color=TINTA, ha="center",
               arrowprops=dict(arrowstyle="-", color=CINZA, lw=0.5, shrinkB=3))
    _salvar(fig, destino, "potencial")


def t_fim_transiente(tr: Trajetoria, pontos: np.ndarray, passos: int = PASSOS_POR_PERIODO) -> float:
    """Último instante estroboscópico a mais de 0,05 do ciclo."""
    idx = np.arange(0, tr.t.size, passos)
    d = np.min(np.hypot(pontos[:, 0][:, None] - tr.x[idx], pontos[:, 1][:, None] - tr.v[idx]), axis=0)
    fora = np.flatnonzero(d > 0.05)
    return float(tr.t[idx[fora[-1] + 1]]) if fora.size else 0.0


def figs_casos(res: dict, destino: Path) -> dict:
    pontos = res["ciclo_a"]["pontos"]
    info = {}
    a = CASOS["A"]
    tr = integrar(a.p, *a.condicoes[0], a.tmax, h=a.p.T / PASSOS_POR_PERIODO)
    info["t_trans_A"] = t_fim_transiente(tr, pontos)
    _salvar(trio(a.p, [(tr, COR_CASO["A"], "")], info["t_trans_A"], pontos=pontos,
                 rotulo_pontos=r"seção de Poincaré ($t=nT$)"), destino, "caso_A")
    b = CASOS["B"]
    cores_b = ["#7CCBB4", COR_CASO["B"], "#00614A"]
    tras = []
    for (x0, v0), cor in zip(b.condicoes, cores_b):
        tras.append((integrar(b.p, x0, v0, b.tmax, h=b.p.T / PASSOS_POR_PERIODO), cor, ""))
    fig = trio(b.p, tras)
    ax_x, ax_v, ax_f = fig.axes
    leg = [Line2D([], [], color=c, lw=1.4, label=rf"$\dot{{x}}(0)={str(v).replace('.', '{,}')}$ m/s")
           for (_, v), c in zip(b.condicoes, cores_b)]
    ax_x.legend(handles=leg, loc="upper right", ncols=3, columnspacing=1.0, handlelength=1.3, fontsize=7.5,
                borderaxespad=0.0)
    _salvar(fig, destino, "caso_B")
    info["finais_B"] = [float(t[0].x[-1]) for t in tras]
    c = CASOS["C"]
    tr = integrar(c.p, *c.condicoes[0], c.tmax, h=c.p.T / PASSOS_POR_PERIODO)
    _salvar(trio(c.p, [(tr, COR_CASO["C"], "")]), destino, "caso_C")
    d = CASOS["D"]
    tr = integrar(d.p, *d.condicoes[0], d.tmax, h=d.p.T / PASSOS_POR_PERIODO)
    idx = np.arange(0, tr.t.size, PASSOS_POR_PERIODO)
    dist = np.hypot(tr.x[idx] - tr.x[idx[-1]], tr.v[idx] - tr.v[idx[-1]])
    fora = np.flatnonzero(dist > 0.05)
    info["t_trans_D"] = float(tr.t[idx[fora[-1] + 1]]) if fora.size else 0.0
    pt = np.array([[tr.x[idx[-1]], tr.v[idx[-1]]]])
    _salvar(trio(d.p, [(tr, COR_CASO["D"], "")], info["t_trans_D"], pontos=pt,
                 rotulo_pontos=r"seção de Poincaré ($t=nT$)"), destino, "caso_D")
    e = CASOS["E"]
    cores_e = [COR_CASO["E"], "#8A5F00"]
    tras = [(integrar(e.p, x0, v0, e.tmax, h=e.p.T / PASSOS_POR_PERIODO), cor, "")
            for (x0, v0), cor in zip(e.condicoes, cores_e)]
    fig = trio(e.p, tras, pontos=np.asarray(res["floquet_casos"]["pontosE"]), rotulo_pontos=r"seção de Poincaré ($t=nT$)")
    leg = [Line2D([], [], color=c, lw=1.4, label=rf"$x(0)={int(x0):+d}$ m") for (x0, _), c in zip(e.condicoes, cores_e)]
    fig.axes[0].legend(handles=leg, loc="upper right", ncols=2, columnspacing=1.0, handlelength=1.3, fontsize=7.5,
                       borderaxespad=0.0)
    _salvar(fig, destino, "caso_E")
    info["finais_E"] = [float(t[0].x[-1]) for t in tras]
    return info


def fig_regime_a(res: dict, t_trans: float, destino: Path) -> None:
    """Caso A em detalhe: o ciclo em unidades de T, separado do transiente no espaço de fases."""
    a = CASOS["A"]
    T = a.p.T
    tr = integrar(a.p, *a.condicoes[0], a.tmax, h=T / PASSOS_POR_PERIODO)
    pts = res["ciclo_a"]["pontos"]
    fig = plt.figure(figsize=(LARGURA, 2.45))
    gs = GridSpec(1, 3, width_ratios=[1.55, 1, 1], wspace=0.27, left=0.065, right=0.99, top=0.885, bottom=0.17)
    ax, bx, cx = (fig.add_subplot(gs[0, i]) for i in range(3))
    m = tr.t >= tr.t[-1] - 10 * T - 1e-9
    n0 = tr.t[m][0] / T
    ax.plot(tr.t[m] / T - n0, tr.x[m], color=COR_CASO["A"], lw=1.0)
    idx = np.arange(0, 11) * PASSOS_POR_PERIODO + np.flatnonzero(m)[0]
    ax.plot(tr.t[idx] / T - n0, tr.x[idx], "o", ms=3.8, mfc=TINTA, mec="white", mew=0.5, zorder=5)
    ax.set_xticks(range(11))
    ax.axvspan(0, 5, color=TRANSIENTE, lw=0, zorder=0)
    ax.text(2.5, 1.72, r"um ciclo: $5T$", ha="center", fontsize=7.5, color=TINTA)
    ax.set_xlim(0, 10)
    ax.set_ylim(-1.7, 2.0)
    ax.set_xlabel(r"$(t-t_0)/T$")
    ax.set_ylabel(r"$x$ [m]")
    ax.set_title("(a) Dois ciclos em regime")
    for eixo, mascara, titulo, cor in ((bx, tr.t <= t_trans, f"(b) Transiente: $t\\leq {mat(t_trans, 3)}$ s", COR_CASO["A"]),
                                       (cx, tr.t > t_trans, "(c) Regime", COR_CASO["A"])):
        eixo.plot(tr.x[mascara], tr.v[mascara], color=cor, lw=0.55 if eixo is bx else 0.8)
        _equilibrios(eixo, a.p)
        eixo.set_xlim(-1.7, 1.7)
        eixo.set_ylim(-1.15, 1.15)
        eixo.set_title(titulo)
        eixo.set_xlabel(r"$x$ [m]")
    cx.plot(pts[:, 0], pts[:, 1], "o", ms=4.0, mfc=TINTA, mec="white", mew=0.5, zorder=8)
    bx.set_ylabel(r"$\dot{x}$ [m/s]", labelpad=1)
    for e_ in (ax, bx, cx):
        virgula(e_)
    _salvar(fig, destino, "regime_A")


def fig_autonomo(res: dict, destino: Path) -> None:
    r = res["autonomo"]
    b = CASOS["B"].p
    fig = plt.figure(figsize=(LARGURA, 3.15))
    gs = GridSpec(2, 2, width_ratios=[1, 1.15], height_ratios=[1, 2.4], hspace=0.68, wspace=0.2,
                  left=0.075, right=0.985, top=0.925, bottom=0.125)
    ax = fig.add_subplot(gs[:, 0])
    cm = ListedColormap([POCO_ESQ, POCO_DIR])
    ax.imshow(r["poco"] > 0, origin="lower", extent=(-2.2, 2.2, -2.2, 2.2), cmap=cm, interpolation="nearest",
              aspect="auto", rasterized=True)
    ax.grid(False)
    for k in ("sep0", "sep1"):
        ax.plot(r[k][:, 0], r[k][:, 1], color=TINTA, lw=0.9)
    # Duas trajetórias coladas à separatriz, uma para cada lado
    ax.plot(r["x1"], r["v1"], color=COR_CASO["B"], lw=0.7)
    ax.plot(r["x2"], r["v2"], color="#00614A", lw=0.7, ls=(0, (3, 1.2)))
    _equilibrios(ax, b)
    ax.set_xlim(-2.2, 2.2)
    ax.set_ylim(-2.2, 2.2)
    ax.set_xlabel(r"$x(0)$ [m]")
    ax.set_ylabel(r"$\dot{x}(0)$ [m/s]", labelpad=1)
    ax.set_title("(a) Bacias dos dois poços")
    ax.text(-1.0, 0.62, r"$x\to-1$", fontsize=7.5, color=TINTA, ha="center")
    ax.text(1.0, 0.72, r"$x\to+1$", fontsize=7.5, color=TINTA, ha="center")
    i = np.argmin(np.hypot(r["sep0"][:, 0] - 0.5, r["sep0"][:, 1] + 0.42))
    i2 = np.argmin(np.hypot(r["sep1"][:, 0] - 0.5, r["sep1"][:, 1] + 0.42))
    alvo = r["sep0"][i] if np.hypot(*(r["sep0"][i] - [0.5, -0.42])) < np.hypot(*(r["sep1"][i2] - [0.5, -0.42])) else r["sep1"][i2]
    ax.annotate("separatriz", tuple(alvo), xytext=(-0.25, -1.05), fontsize=7.5, color=TINTA, ha="center",
                arrowprops=dict(arrowstyle="-", color=TINTA, lw=0.5, shrinkB=1))
    virgula(ax)

    ax2 = fig.add_subplot(gs[0, 1])
    J = r["impulsos"]
    ax2.imshow((r["finais"] > 0)[None, :], extent=(J[0], J[-1], 0, 1), cmap=cm, aspect="auto",
               interpolation="nearest", rasterized=True)
    for v in r["limiares"]:
        ax2.axvline(v, color=TINTA, lw=0.6)
    ax2.grid(False)
    ax2.set_yticks([])
    ax2.set_xlim(J[0], J[-1])
    ax2.spines["left"].set_visible(False)
    ax2.set_xlabel(r"impulso $J/m=\dot{x}(0)$ [m/s], a partir de $x=1$", labelpad=1.5)
    ax2.set_title("(b) Poço final")
    ax2.legend(handles=[Patch(fc=POCO_DIR, ec=CINZA, lw=0.3, label=r"$x\to+1$"),
                        Patch(fc=POCO_ESQ, ec=CINZA, lw=0.3, label=r"$x\to-1$")], ncols=2,
               loc="lower right", bbox_to_anchor=(1.0, 0.98), handlelength=1.1, columnspacing=0.8, fontsize=7.5,
               borderaxespad=0)
    virgula(ax2, "x")

    ax3 = fig.add_subplot(gs[1, 1])
    ax3.plot(r["t"], r["x1"], color=COR_CASO["B"], lw=1.0)
    ax3.plot(r["t"], r["x2"], color="#00614A", lw=1.0, ls=(0, (3, 1.2)))
    ax3.set_xlim(0, r["t"][-1])
    ax3.set_xlabel(r"$t$ [s]")
    ax3.set_ylabel(r"$x$ [m]", labelpad=1)
    v_c = float(r["limiares"][0])
    ax3.set_title(rf"(c) Dois impulsos que diferem em $2\times10^{{-8}}$ m/s")
    ax3.text(r["t"][-1] - 2, r["x1"][-1] + 0.12 * np.sign(r["x1"][-1]), rf"$\dot{{x}}(0)=v_c-10^{{-8}}$", ha="right",
             va="bottom" if r["x1"][-1] > 0 else "top", fontsize=7.5)
    ax3.text(r["t"][-1] - 2, r["x2"][-1] + 0.12 * np.sign(r["x2"][-1]), rf"$\dot{{x}}(0)=v_c+10^{{-8}}$", ha="right",
             va="bottom" if r["x2"][-1] > 0 else "top", fontsize=7.5)
    ax3.set_ylim(-1.75, 1.75)
    virgula(ax3)
    _salvar(fig, destino, "autonomo")


JANELA_ATRATOR = (-0.80, -0.40, 0.35, 0.80)


def fig_secoes(res: dict, destino: Path) -> None:
    r = res["atrator_c"]
    pts = res["ciclo_a"]["pontos"]
    fig = plt.figure(figsize=(LARGURA, 2.5))
    gs = GridSpec(1, 3, wspace=0.14, left=0.085, right=0.985, top=0.885, bottom=0.17)
    a = fig.add_subplot(gs[0, 0])
    c = fig.add_subplot(gs[0, 1], sharex=a, sharey=a)
    z = fig.add_subplot(gs[0, 2])
    a.plot(pts[:, 0], pts[:, 1], "o", ms=5.5, color=COR_CASO["A"], mec="white", mew=0.6)
    desloc = [(7, 3), (-7, -9), (7, -4), (-9, 4), (6, 5)]
    for i, (x, y) in enumerate(pts):
        a.annotate(str(i + 1), (x, y), xytext=desloc[i], textcoords="offset points", fontsize=8, color=TINTA)
    a.set_title(r"(a) A: 5 pontos")
    c.plot(r["secao"][:, 0], r["secao"][:, 1], ".", ms=0.9, mew=0, color=COR_CASO["C"], alpha=0.5, rasterized=True)
    c.set_title(r"(b) C: atrator estranho")
    c.tick_params(labelleft=False)
    j = JANELA_ATRATOR
    c.add_patch(Rectangle((j[0], j[2]), j[1] - j[0], j[3] - j[2], fc="none", ec=TINTA, lw=0.7))
    d = r["densa"]
    m = (d[:, 0] > j[0]) & (d[:, 0] < j[1]) & (d[:, 1] > j[2]) & (d[:, 1] < j[3])
    z.plot(d[m, 0], d[m, 1], ".", ms=0.8, mew=0, color=COR_CASO["C"], alpha=0.45, rasterized=True)
    z.set_xlim(j[0], j[1])
    z.set_ylim(j[2], j[3])
    z.set_xticks([-0.8, -0.7, -0.6, -0.5])
    z.set_title("(c) C: ampliação")
    a.set_xlim(-1.75, 1.75)
    a.set_ylim(-1.1, 1.3)
    a.set_ylabel(r"$\dot{x}(nT)$ [m/s]")
    for ax in (a, c, z):
        ax.set_xlabel(r"$x(nT)$ [m]")
        virgula(ax)
    _salvar(fig, destino, "secoes")


def fig_bifurcacao(res: dict, destino: Path) -> None:
    r = res["bifurcacao"]
    g = r["gammas"]
    fig, (ax, bx) = plt.subplots(2, 1, figsize=(LARGURA, 3.9), sharex=True, height_ratios=[2.2, 1],
                                 layout="constrained")
    xs = np.repeat(g[:, None], r["x"].shape[2], axis=1)
    xs = np.repeat(xs[None, :, :], r["x"].shape[0], axis=0)
    ax.plot(xs.ravel(), r["x"].ravel(), ".", ms=0.8, mew=0, color=TINTA, alpha=0.4, rasterized=True)
    ax.set_ylabel(r"$x(nT)$ em regime [m]")
    ax.set_xlim(g[0], g[-1])
    ax.set_title("Regime permanente conforme a amplitude da força")
    lam = r["lam"]
    bx.axhline(0, color=TINTA, lw=0.7)
    gg = np.repeat(g, lam.shape[1])
    bx.plot(gg, lam.ravel(), ".", ms=1.3, color=CINZA, rasterized=True)
    bx.set_ylabel(r"$\lambda_1$ [1/s]")
    bx.set_xlabel(r"$\gamma=A/m$ [m/s²]")
    bx.set_ylim(-0.22, 0.22)
    for chave, gam in (("A", 0.37), ("C", 0.50)):
        for e in (ax, bx):
            e.axvline(gam, color=COR_CASO[chave], lw=1.0, zorder=1)
        ax.annotate(f"caso {chave}", (gam, 1), xycoords=("data", "axes fraction"), xytext=(3, -9),
                    textcoords="offset points", fontsize=8, color=TINTA, fontweight="bold",
                    bbox=dict(fc="white", ec="none", pad=1.2, alpha=0.9))
    bx.text(0.205, 0.13, r"$\lambda_1>0$: caos", ha="left", fontsize=8, color=TINTA)
    bx.text(0.645, -0.19, r"$\lambda_1<0$: regime periódico", ha="right", fontsize=8, color=TINTA)
    virgula(ax)
    virgula(bx)
    _salvar(fig, destino, "bifurcacao")


def fig_bacias(res: dict, destino: Path) -> None:
    r = res["bacias_a"]
    cm = ListedColormap(["#FFFFFF", *COR_FASE])
    from scipy import ndimage

    fig, axes = plt.subplots(1, 2, figsize=(LARGURA, 3.15), layout="constrained")
    for ax, nome, titulo in ((axes[0], "geral", "(a) Condições iniciais em toda a região"),
                             (axes[1], "zoom", "(b) Ampliação do retângulo")):
        j = r[f"janela_{nome}"]
        rot = r[f"rotulo_{nome}"]
        for fase in range(5):  # numera a maior região contínua de cada fase
            comp, n = ndimage.label(rot == fase)
            if n == 0:
                continue
            maior = np.argmax(ndimage.sum_labels(np.ones_like(comp), comp, range(1, n + 1))) + 1
            dist = ndimage.distance_transform_edt(np.pad(comp == maior, 1))[1:-1, 1:-1]  # longe da borda
            iy, ix = np.unravel_index(np.argmax(dist), dist.shape)
            if dist[iy, ix] < 7:
                continue
            ax.text(j[0] + (j[1] - j[0]) * ix / rot.shape[1], j[2] + (j[3] - j[2]) * iy / rot.shape[0], str(fase + 1),
                    fontsize=7.5, color=TINTA, ha="center", va="center", zorder=6,
                    bbox=dict(boxstyle="circle,pad=0.18", fc="white", ec="none", alpha=0.9))
        ax.imshow(r[f"rotulo_{nome}"], origin="lower", extent=tuple(j), cmap=cm, vmin=-1, vmax=4,
                  interpolation="nearest", aspect="auto", rasterized=True)
        ax.grid(False)
        ax.set_title(titulo)
        ax.set_xlabel(r"$x(0)$ [m]")
        virgula(ax)
    axes[0].set_ylabel(r"$\dot{x}(0)$ [m/s]")
    j = r["janela_zoom"]
    axes[0].add_patch(Rectangle((j[0], j[2]), j[1] - j[0], j[3] - j[2], fc="none", ec="white", lw=1.8))
    axes[0].add_patch(Rectangle((j[0], j[2]), j[1] - j[0], j[3] - j[2], fc="none", ec=TINTA, lw=0.8))
    fig.legend(handles=[Patch(fc=c, ec="none", label=f"ponto {i + 1}") for i, c in enumerate(COR_FASE)],
               loc="outside lower center", ncols=5, handlelength=1.1, columnspacing=1.6)
    _salvar(fig, destino, "bacias")


def fig_incerteza(res: dict, destino: Path) -> None:
    r, ctl = res["incerteza_a"], res["controle_incerteza"]
    fig, (a, b) = plt.subplots(1, 2, figsize=(LARGURA, 2.6), layout="constrained")
    eps, f = r["epsilons"], r["fracao"]
    a.loglog(eps, f, "o", ms=4.5, color=COR_CASO["A"], mec="white", mew=0.5, zorder=3)
    e = eps[eps <= 1e-3]
    a.loglog(e, float(r["f0"]) * e ** float(r["phi"]), color=TINTA, lw=0.8, zorder=2)
    a.text(1e-8, 0.12, rf"caso A: $\varphi={mat(float(r['phi']), 2)}$", fontsize=8.5, color=TINTA, ha="left")
    fe, ee = ctl["f20"], ctl["eps"]
    m = fe > 0
    a.loglog(ee[m], fe[m], "s", ms=4.2, color=COR_CASO["E"], mec="white", mew=0.5, zorder=3)
    a.text(1.5e-5, 3.5e-3, rf"caso E: $\varphi={mat(float(ctl['phi20']), 2)}$", fontsize=8.5, color=TINTA, ha="left")
    a.set_xlabel(r"distância inicial $\varepsilon$ (adimensional)")
    a.set_ylabel(r"fração $f$ com final diferente")
    a.set_title("(a) Sensibilidade do estado final")
    a.invert_xaxis()
    s = r["sobrev"]
    ts = np.arange(s.size) * CASOS["A"].p.T
    ok = s > 0
    b.semilogy(ts[ok], s[ok], color=COR_CASO["A"], lw=1.3)
    b.set_xlabel(r"duração do transiente $t$ [s]")
    b.set_ylabel(r"fração ainda em transiente")
    b.set_title("(b) Caso A: escape do transiente")
    virgula(b, "x")
    _salvar(fig, destino, "incerteza")


def fig_sensibilidade(res: dict, destino: Path) -> None:
    r = res["sensibilidade"]
    t = r["t"]
    xs = f"{float(r['x_sep']):g}".replace(".", "{,}")
    fig = plt.figure(figsize=(LARGURA, 4.2))
    gs = GridSpec(2, 2, width_ratios=[1.3, 1], hspace=0.42, wspace=0.27, left=0.065, right=0.99, top=0.945, bottom=0.09)
    a1 = fig.add_subplot(gs[0, 0])
    a1.plot(t, r["a1x"], color=COR_CASO["A"], lw=0.8, label=rf"$x(0)={xs}$")
    a1.plot(t, r["a2x"], color=TINTA, lw=0.8, ls=(0, (2.5, 1.2)), label=rf"$x(0)={xs}+10^{{-6}}$")
    a1.set_title(r"(a) Caso A: duas trajetórias")
    a1.set_ylabel(r"$x$ [m]")
    a1.set_xlim(0, t[-1])
    a1.set_ylim(-2.1, 2.9)
    a1.set_yticks([-2, -1, 0, 1, 2])
    a1.legend(loc="upper right", ncols=2, fontsize=7.5, borderaxespad=0, columnspacing=1, handlelength=1.8)
    b1 = fig.add_subplot(gs[0, 1])
    b1.semilogy(t, r["a_d"], color=COR_CASO["A"], lw=0.8)
    b1.semilogy(t, np.maximum(r["b_d"], 1e-17), color=CINZA, lw=0.8)
    b1.semilogy(t, r["v_d"], color=TINTA, lw=0.6, ls=(0, (2.5, 1.2)))
    b1.set_ylabel(r"$|\Delta|$ (adimensional)", labelpad=1)
    b1.set_ylim(1e-16, 30)
    b1.set_yticks([1e-15, 1e-10, 1e-5, 1])
    b1.minorticks_off()
    b1.set_xlim(0, t[-1])
    b1.set_title(r"(b) Caso A: distância $|\Delta(t)|$")
    b1.text(t[-1] - 5, 6, r"divergem: perturbação em $x(0)$ e em $\dot{x}(0)$", color=TINTA, fontsize=7.5, ha="right", va="bottom")
    b1.text(8, 3e-15, r"par com $x(0)=1$: converge", color=TINTA, fontsize=7.5, ha="left", va="bottom")
    a2 = fig.add_subplot(gs[1, 0])
    a2.plot(t, r["c1x"], color=COR_CASO["C"], lw=0.8, label=r"$x(0)=1$")
    a2.plot(t, r["c2x"], color=TINTA, lw=0.8, ls=(0, (2.5, 1.2)), label=r"$x(0)=1+10^{-10}$")
    a2.set_title(r"(c) Caso C: duas trajetórias")
    a2.set_ylabel(r"$x$ [m]")
    a2.set_xlabel(r"$t$ [s]")
    a2.set_xlim(0, t[-1])
    a2.set_ylim(-2.1, 2.9)
    a2.set_yticks([-2, -1, 0, 1, 2])
    a2.legend(loc="upper right", ncols=2, fontsize=7.5, borderaxespad=0, columnspacing=1, handlelength=1.8)
    b2 = fig.add_subplot(gs[1, 1])
    te, ln_d = r["t_ens"], r["ln_d"]
    b2.semilogy(t, r["c_d"] + 1e-30, color=COR_CASO["C"], lw=0.5, alpha=0.8)
    b2.semilogy(t, r["c_d_v"] + 1e-30, color=COR_CASO["C"], lw=0.5, alpha=0.8, ls=(0, (2.5, 1.2)))
    b2.semilogy(te, np.exp(ln_d), color=TINTA, lw=1.2)
    b2.set_ylabel(r"$|\Delta|$ (adimensional)", labelpad=1)
    b2.set_xlim(0, t[-1])
    b2.set_ylim(1e-16, 30)
    b2.set_yticks([1e-15, 1e-10, 1e-5, 1])
    b2.minorticks_off()
    b2.set_xlabel(r"$t$ [s]")
    b2.set_title(r"(d) Caso C: distância $|\Delta(t)|$")
    k = np.searchsorted(te, 60)
    b2.annotate(rf"média de 4000 pares ($\varepsilon=10^{{-12}}$)", (te[k], np.exp(ln_d[k])), xytext=(4, 1e-14), fontsize=7.5,
                color=TINTA, ha="left", arrowprops=dict(arrowstyle="-", color=CINZA, lw=0.5))
    for ax in (a1, a2):
        virgula(ax)
    for ax in (b1, b2):
        virgula(ax, "x")
    _salvar(fig, destino, "sensibilidade")


def fig_espectros(res: dict, destino: Path) -> None:
    """Espectros em regime: linhas discretas nos casos periódicos, banda larga no caos."""
    r = res["espectros"]
    fig, axes = plt.subplots(3, 1, figsize=(LARGURA, 3.5), sharex=True, layout="constrained")
    for ax, chave, titulo in zip(axes, "ADC", (r"Caso A: período 5, múltiplos ímpares de $\omega/5$",
                                               r"Caso D: período 1, múltiplos ímpares de $\omega$",
                                               "Caso C: caos, banda larga, com picos sobre um fundo contínuo")):
        f, a = r[f"f{chave}"], r[f"a{chave}"]
        ax.semilogy(f, np.maximum(a, 1e-12), color=COR_CASO[chave], lw=0.7)
        ax.set_xlim(0, 4)
        ax.set_ylim(1e-7, 3)
        ax.set_yticks([1e-6, 1e-4, 1e-2, 1])
        ax.minorticks_off()
        ax.set_title(titulo)
        ax.set_ylabel("amplitude [m]")
        ax.set_xticks([0, 1, 2, 3, 4])
    axes[-1].set_xlabel(r"frequência $/$ frequência da força")
    virgula(axes[-1], "x")
    _salvar(fig, destino, "espectros")


def fig_janela(res: dict, destino: Path) -> None:
    """A janela do caso A em detalhe e a estabilidade da órbita simétrica."""
    z, j = res["zoom_bifurcacao"], res["janela_p5"]
    g = z["gammas"]
    fig, (a, b) = plt.subplots(2, 1, figsize=(LARGURA, 3.4), sharex=True, height_ratios=[1.7, 1], layout="constrained")
    s = z["s"][..., 0]
    xs = np.repeat(g[:, None], s.shape[2], axis=1)
    xs = np.repeat(xs[None], s.shape[0], axis=0)
    a.plot(xs.ravel(), s.ravel(), ".", ms=1.1, mew=0, color=TINTA, alpha=0.55, rasterized=True)
    a.set_ylabel(r"$x(nT)$ em regime [m]")
    a.set_xlim(g[0], g[-1])
    a.set_title("Regime permanente na janela")
    t = j["tabela"]
    b.semilogy(t[:, 0], t[:, 2], color=TINTA, lw=1.1)
    b.axhline(1, color=CINZA, lw=0.7)
    b.set_ylim(0.01, 6)
    b.set_ylabel(r"maior $|\mu|$")
    b.set_xlabel(r"$\gamma=A/m$ [m/s²]")
    b.set_title("Estabilidade da órbita de período 5 simétrica")
    for ax in (a, b):
        ax.axvspan(float(j["g_baixo"]), float(j["g_alto"]), color=TRANSIENTE, lw=0, zorder=0)
        ax.axvline(0.37, color=COR_CASO["A"], lw=1.0, zorder=1)
        virgula(ax, "x")
    virgula(a, "y")
    a.annotate("caso A", (0.37, 1), xycoords=("data", "axes fraction"), xytext=(3, -9), textcoords="offset points",
               fontsize=8, color=TINTA, fontweight="bold", bbox=dict(fc="white", ec="none", pad=1.2, alpha=0.9))
    b.text(float(j["g_baixo"]) + 0.0004, 2.2, "simétrica estável", fontsize=7.5, color=TINTA)
    _salvar(fig, destino, "janela")


def fig_variedades(res: dict, destino: Path) -> None:
    r = res["variedades"]
    fig = plt.figure(figsize=(LARGURA, 2.55))
    gs = GridSpec(1, 3, width_ratios=[1, 1, 0.95], wspace=0.24, left=0.07, right=0.99, top=0.885, bottom=0.17)
    atr = {"20": res["floquet_casos"]["pontosE"], "37": res["ciclo_a"]["pontos"]}
    titulo = {"20": r"(a) $\gamma=0{,}20$", "37": r"(b) $\gamma=0{,}37$"}
    ax0 = None
    for i, k in enumerate(("20", "37")):
        ax = fig.add_subplot(gs[0, i], sharex=ax0, sharey=ax0)
        ax0 = ax0 or ax
        for nome, cor, lw in (("S", COR_CASO["A"], 0.45), ("U", COR_CASO["C"], 0.45)):
            for c in sorted(q for q in r if q.startswith(f"{nome}{k}_")):
                ax.plot(r[c][:, 0], r[c][:, 1], color=cor, lw=lw, rasterized=True)
        z = r[f"z{k}"]
        ax.plot(z[0], z[1], "x", ms=4.5, mec=TINTA, mew=1.0, zorder=7)
        ax.plot(atr[k][:, 0], atr[k][:, 1], "o", ms=3.5, mfc=TINTA, mec="white", mew=0.5, zorder=7)
        ax.set_xlim(-2.2, 2.2)
        ax.set_ylim(-2.2, 2.2)
        ax.set_title(titulo[k])
        ax.set_xlabel(r"$x$ [m]")
        virgula(ax)
        if i == 0:
            ax.set_ylabel(r"$\dot{x}$ [m/s]", labelpad=1)
            ax.legend(handles=[Line2D([], [], color=COR_CASO["A"], lw=1.2, label=r"$W^s$"),
                               Line2D([], [], color=COR_CASO["C"], lw=1.2, label=r"$W^u$")],
                      loc="upper left", ncols=2, handlelength=1.1, columnspacing=0.8, fontsize=7.5, borderaxespad=0.1)
        else:
            ax.tick_params(labelleft=False)
    c = fig.add_subplot(gs[0, 2])
    g, n = r["gammas"], r["n"]
    c.plot(g, n, "o-", ms=2.8, color=TINTA, lw=0.8, mec="white", mew=0.3)
    c.axvline(float(r["g_c"]), color=CINZA, lw=0.8, ls=(0, (3, 2)))
    c.annotate(rf"Melnikov: $\gamma_c={mat(float(r['g_c']), 3)}$", (float(r["g_c"]), 0.72), xycoords=("data", "axes fraction"),
               xytext=(-3, 0), textcoords="offset points", ha="right", fontsize=7.5, color=TINTA)
    c.set_title("(c) Cruzamentos")
    c.set_xlabel(r"$\gamma$ [m/s²]")
    c.set_ylabel("número detectado", labelpad=1)
    virgula(c, "x")
    _salvar(fig, destino, "variedades")


def fig_bacia_e(res: dict, destino: Path) -> None:
    r, v = res["bacias_e"], res["variedades"]
    fig, ax = plt.subplots(figsize=(LARGURA * 0.5, 2.75), layout="constrained")
    ax.imshow(r["rotulo"], origin="lower", extent=(-2, 2, -2, 2), cmap=ListedColormap([POCO_DIR, POCO_ESQ]),
              interpolation="nearest", aspect="auto", rasterized=True)
    ax.grid(False)
    for c in sorted(q for q in v if q.startswith("S20_")):
        ax.plot(v[c][:, 0], v[c][:, 1], color=TINTA, lw=0.7, rasterized=True)
    p = r["pontos"]
    ax.plot(p[:, 0], p[:, 1], "o", ms=4, mfc=TINTA, mec="white", mew=0.5, zorder=7)
    ax.set_xlim(-2, 2)
    ax.set_ylim(-2, 2)
    ax.set_xlabel(r"$x(0)$ [m]")
    ax.set_ylabel(r"$\dot{x}(0)$ [m/s]", labelpad=1)
    virgula(ax)
    _salvar(fig, destino, "bacia_E")


def fig_verificacao(res: dict, destino: Path) -> None:
    r = res["convergencia"]
    fig, axes = plt.subplots(1, 2, figsize=(LARGURA, 2.35), layout="constrained")
    hs = r["hs"]
    a, b = axes
    a.loglog(hs, r["erro"], "o-", ms=4, color=COR_CASO["A"], mec="white", mew=0.5, lw=1.1, zorder=3)
    ref = r["erro"][-2] * (hs / hs[-2]) ** 4
    a.loglog(hs, ref, color=CINZA, lw=0.8, ls=(0, (3, 2)))
    a.text(hs[2] * 1.15, ref[2] * 0.25, r"inclinação 4", fontsize=8, color=TINTA, ha="left", va="top")
    a.set_title("(a) Erro global em $t=20$ s, em relação ao DOP853")
    a.set_ylabel(r"erro em $(x,\dot{x})$")
    b.loglog(hs, r["fecho"], "o-", ms=4, color=COR_CASO["A"], mec="white", mew=0.5, lw=1.1)
    b.set_title("(b) Resíduo do balanço de energia")
    b.set_ylabel("resíduo [J]")
    for ax in axes:
        ax.set_xlabel("passo $h$ [s]")
        ax.axvline(float(r["h_padrao"]), color=TINTA, lw=0.7)
        ax.annotate("passo adotado", (float(r["h_padrao"]), 0.04), xycoords=("data", "axes fraction"), xytext=(-3, 0),
                    textcoords="offset points", ha="right", fontsize=7.5, color=TINTA)
    _salvar(fig, destino, "verificacao")


def fig_capa(res: dict, destino: Path) -> None:
    """Os quatro espaços de fases, lado a lado e nas mesmas escalas: o resumo do trabalho."""
    fig, axes = plt.subplots(1, 5, figsize=(LARGURA, 1.7), sharex=True, sharey=True, layout="constrained")
    subtitulo = {"A": "período 5", "B": "repouso", "C": "caos", "D": "período 1", "E": "2 atratores"}
    for ax, chave in zip(axes, "ABCDE"):
        caso = CASOS[chave]
        if len(caso.condicoes) > 1:
            cores = ["#7CCBB4", COR_CASO["B"], "#00614A"] if chave == "B" else [COR_CASO["E"], "#8A5F00"]
            for (x0, v0), cor in zip(caso.condicoes, cores):
                tr = integrar(caso.p, x0, v0, caso.tmax, h=caso.p.T / PASSOS_POR_PERIODO)
                ax.plot(tr.x, tr.v, color=cor, lw=0.6)
        else:
            tr = integrar(caso.p, *caso.condicoes[0], caso.tmax, h=caso.p.T / PASSOS_POR_PERIODO)
            _gradiente(ax, tr.x, tr.v, COR_CASO[chave], lw=0.45)
        _equilibrios(ax, caso.p)
        ax.set_title(f"{chave}: {subtitulo[chave]}", fontsize=9)
        ax.set_xlim(-2.0, 2.0)
        ax.set_ylim(-2.3, 2.3)
        ax.set_xticks([-1, 0, 1])
        ax.set_yticks([-2, -1, 0, 1, 2])
        ax.set_xlabel(r"$x$ [m]", labelpad=1)
        virgula(ax)
    axes[0].set_ylabel(r"$\dot{x}$ [m/s]", labelpad=1)
    _salvar(fig, destino, "capa")


def gerar(res: dict, destino: Path) -> dict:
    aplicar_estilo()
    fig_capa(res, destino)
    fig_potencial(destino)
    info = figs_casos(res, destino)
    fig_regime_a(res, info["t_trans_A"], destino)
    fig_espectros(res, destino)
    fig_janela(res, destino)
    fig_variedades(res, destino)
    fig_bacia_e(res, destino)
    fig_autonomo(res, destino)
    fig_secoes(res, destino)
    fig_bifurcacao(res, destino)
    fig_bacias(res, destino)
    fig_incerteza(res, destino)
    fig_sensibilidade(res, destino)
    fig_verificacao(res, destino)
    return info
