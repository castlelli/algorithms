"""Relatório em PDF: figuras (matplotlib) + template LaTeX (jinja2) → tectonic.

A animação vai embutida no PDF com o pacote ``animate`` (quadros PNG + controles):
é a forma de o professor ver o movimento sem sair do relatório. Como só Adobe
Reader, Okular e PDF-XChange executam ``animate``, o PDF traz também a grade de
quadros-chave e aponta o MP4/GIF.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import sympy as sp
from jinja2 import Environment, FileSystemLoader, StrictUndefined

from . import animacao as anim
from .animacao import Escalas, VistaTopo, ferramenta
from .estilo import CINZA, CINZA_CLARO, CORES, DISCO, FUNDO_ACC, FUNDO_VEL, ROTULOS, TINTA, aplicar_estilo, virgula
from .formatacao import bruto, formato_s, latex_decimal, latex_num, mat, num, sig
from .modelo import ACELERACOES, VELOCIDADES, VETORES, Movimento, grupo_no_instante
from .verificacao import TOL_DERIVADA, erros_derivada, verificar

import matplotlib.pyplot as plt  # noqa: E402  (animacao já fixou o backend Agg)
from matplotlib.collections import LineCollection  # noqa: E402
from matplotlib.legend_handler import HandlerPatch  # noqa: E402
from matplotlib.patches import Circle, FancyArrow, FancyArrowPatch, Patch  # noqa: E402

LARGURA = 16.0 / 2.54  # \textwidth do template (16 cm), para as fontes saírem no tamanho real
TEMPLATES = Path(__file__).parent / "templates"


@dataclass
class Resultado:
    pdf: Path
    mp4: Path | None
    gif: Path | None
    avisos_latex: list[str] = field(default_factory=list)
    checagens_ok: bool = True
    ctx: dict = field(default_factory=dict, repr=False)  # contexto do template, para o conjunto


# ------------------------------------------------------------------------ figuras
def _seta_legenda(legend, orig_handle, xdescent, ydescent, width, height, fontsize):  # noqa: ANN001
    h = height
    return FancyArrow(0, h / 2, width, 0, width=h * 0.16, head_width=h * 0.62, head_length=h * 0.62,
                      length_includes_head=True, color=orig_handle.get_facecolor())


def legenda_vetores(alvo, nomes=VETORES, **kw) -> None:  # noqa: ANN001 (Figure | Axes)
    """Legenda com setas coloridas (as mesmas cores da animação)."""
    proxies = [Patch(color=CORES[n], label=ROTULOS[n]) for n in nomes]
    alvo.legend(handles=proxies, handler_map={Patch: HandlerPatch(patch_func=_seta_legenda)},
                handlelength=2.2, **kw)


def _sombrear_dt(ax, mov: Movimento) -> None:  # noqa: ANN001
    """Faixas de fundo com a alternância da animação (V em azul, A em laranja)."""
    for k, t0 in enumerate(mov.instantes_dt()):
        t1 = min(t0 + mov.dt, mov.t_f)
        if t1 > t0:
            ax.axvspan(t0, t1, color=FUNDO_VEL if k % 2 == 0 else FUNDO_ACC, alpha=0.55, lw=0, zorder=0)


def _intervalos_omega_negativa(mov: Movimento) -> list[tuple[float, float]]:
    tt = np.linspace(0, mov.t_f, 4001)
    neg = mov.omega(tt) < 0
    out, inicio = [], None
    for ti, n in zip(tt, neg):
        if n and inicio is None:
            inicio = ti
        if not n and inicio is not None:
            out.append((inicio, ti))
            inicio = None
    if inicio is not None:
        out.append((inicio, mov.t_f))
    return out


def _meia_janela(mov: Movimento, esc: Escalas, pares: list[tuple[float, str]], folga: float) -> float:
    """Meia-largura que contém o disco (com ``folga``·R) e as pontas dos vetores dados."""
    pontas = [mov.estado(np.array([t])).posicao[0]
              + mov.estado(np.array([t])).cartesiano(n)[0] * esc.de(n) for t, n in pares]
    alcance = max((float(np.abs(p).max()) for p in pontas), default=0.0)
    return max(folga * mov.R, 1.06 * alcance)


def fig_resumo(mov: Movimento, esc: Escalas, caminho: Path) -> None:
    """Trajetória absoluta com v_abs nos múltiplos pares de Δt e a_abs nos ímpares."""
    fig, ax = plt.subplots(figsize=(0.47 * LARGURA, 0.47 * LARGURA))
    R = mov.R
    ax.add_patch(Circle((0, 0), R, fc=DISCO, ec=TINTA, lw=1.0))
    tt = np.linspace(0, mov.t_f, 1200)
    xy = mov.estado(tt).posicao
    seg = np.stack([xy[:-1], xy[1:]], axis=1)
    lc = LineCollection(seg, cmap="Greys", norm=plt.Normalize(-0.35 * mov.t_f, mov.t_f), lw=1.8)
    lc.set_array(tt[:-1])
    ax.add_collection(lc)
    e = mov.estado(mov.instantes_dt())
    for k in range(len(e.t)):
        nome = "v_abs" if k % 2 == 0 else "a_abs"
        F = e.posicao[k]
        d = e.cartesiano(nome)[k] * esc.de(nome)
        if np.linalg.norm(d) > 1e-4 * R:
            ax.add_patch(FancyArrowPatch(F, F + d, arrowstyle="-|>", mutation_scale=8, lw=1.3,
                                         color=CORES[nome], zorder=5))
        ax.plot(*F, "o", ms=2.8, color=TINTA, zorder=6)
    ax.plot(*xy[0], "o", ms=5, mfc="white", mec=TINTA, zorder=7)
    ax.annotate("início", xy[0], xytext=(4, 5), textcoords="offset points", fontsize=8, color=CINZA)
    ax.plot(0, 0, "+", color=TINTA, ms=6)
    L = _meia_janela(mov, esc, [(tk, "v_abs" if k % 2 == 0 else "a_abs")
                                 for k, tk in enumerate(mov.instantes_dt())], folga=1.12)
    ax.set(xlim=(-L, L), ylim=(-L, L), aspect="equal")
    ax.axis("off")
    legenda_vetores(ax, ("v_abs", "a_abs"), loc="lower center", ncols=2, fontsize=8.5,
                    bbox_to_anchor=(0.5, -0.04), columnspacing=1.2)
    fig.subplots_adjust(0, 0.02, 1, 1)
    fig.savefig(caminho)
    plt.close(fig)


def fig_lei(mov: Movimento, caminho: Path) -> None:
    tt = np.linspace(0, mov.t_f, 800)
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(LARGURA, 2.35), constrained_layout=True)
    ts = mov.t_instante
    for ax, f, cor, rot, unid in ((a1, mov.r, CORES["v_abs"], "r", "m"),
                                  (a2, mov.phi, CORES["a_arr"], r"\varphi", "rad")):
        ax.plot(tt, f(tt), color=cor, lw=1.8)
        ax.plot([ts], [float(f(ts))], "o", ms=4.5, color=TINTA, zorder=5)
        ax.annotate(rf"$t = {mat(ts, 3)}$ s", (ts, float(f(ts))), xytext=(6, 6),
                    textcoords="offset points", fontsize=8.5)
        ax.set_xlabel(r"$t$ [s]")
        ax.set_ylabel(rf"${rot}(t)$ [{unid}]")
        ax.set_xlim(0, mov.t_f)
        virgula(ax)
    for t0, t1 in _intervalos_omega_negativa(mov):
        a2.axvspan(t0, t1, color=CINZA_CLARO, alpha=0.5, lw=0)
        a2.text((t0 + t1) / 2, 0.04, r"$\omega<0$" + "\n(horário)", transform=a2.get_xaxis_transform(),
                ha="center", va="bottom", fontsize=8, color=CINZA)
    a1.set_ylim(bottom=0)
    fig.savefig(caminho)
    plt.close(fig)


def fig_trajetorias(mov: Movimento, caminho: Path) -> None:
    R = mov.R
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(LARGURA, 0.47 * LARGURA), constrained_layout=True)
    tt = np.linspace(0, mov.t_f, 1500)
    e = mov.estado(tt)
    ek = mov.estado(mov.instantes_dt())
    # Absoluta: no referencial fixo (O, i, j). O contorno do disco é invariante pela rotação.
    a1.add_patch(Circle((0, 0), R, fc=DISCO, ec=TINTA, lw=1.0))
    a1.plot(*e.posicao.T, color=CORES["v_abs"], lw=1.8)
    a1.plot(*ek.posicao.T, "o", ms=3.2, color=TINTA)
    # Relativa: no referencial do carrossel, a reta da formiga é o eixo x'.
    a2.add_patch(Circle((0, 0), R, fc=DISCO, ec=TINTA, lw=1.0))
    for k in range(8):
        ang = np.pi / 8 + k * np.pi / 4
        a2.plot([0, R * np.cos(ang)], [0, R * np.sin(ang)], color=CINZA_CLARO, lw=0.9)
    a2.plot([0, R], [0, 0], color=TINTA, lw=0.9, ls=(0, (4, 3)))
    a2.plot(e.r, 0 * e.r, color=CORES["v_rel"], lw=3.0, solid_capstyle="round")
    a2.plot(ek.r, 0 * ek.r, "o", ms=3.2, color=TINTA)
    a2.add_patch(FancyArrowPatch((0.62 * R, 0.13 * R), (0.32 * R, 0.13 * R), arrowstyle="-|>",
                                 mutation_scale=9, color=CORES["v_rel"], lw=1.2))
    a2.text(0.47 * R, 0.2 * R, r"$-v\,\mathbf{e}_r$", ha="center", fontsize=9, color=TINTA)
    ultimo = np.inf
    for k, rk in enumerate(ek.r):  # rótulo t_k só onde não colide com o anterior
        if ultimo - rk >= 0.3 * R:
            a2.annotate(f"{num(ek.t[k], 3)} s", (rk, 0), xytext=(0, -6), textcoords="offset points",
                        ha="center", va="top", fontsize=7.5, color=CINZA)
            ultimo = rk
    for ax, titulo, xl, yl in ((a1, "Trajetória absoluta (referencial fixo)", r"$x$ [m]", r"$y$ [m]"),
                               (a2, "Trajetória relativa (referencial do carrossel)",
                                r"$x_1$ [m]  (ao longo da reta da formiga)", r"$y_1$ [m]")):
        L = 1.08 * R
        ax.set(xlim=(-L, L), ylim=(-L, L), aspect="equal", xlabel=xl, ylabel=yl)
        ax.set_title(titulo, fontsize=9.5)
        ax.plot(0, 0, "+", color=TINTA, ms=6)
        virgula(ax)
    fig.savefig(caminho)
    plt.close(fig)


def _janela_instante(mov: Movimento, esc: Escalas) -> tuple[np.ndarray, float]:
    """Centro e meia-largura de uma "lupa" que contém F e as pontas dos 7 vetores."""
    e = mov.estado(np.array([mov.t_instante]))
    F = e.posicao[0]
    pts = np.array([F] + [F + e.cartesiano(n)[0] * esc.de(n) for n in VETORES])
    lo, hi = pts.min(axis=0), pts.max(axis=0)
    meia = max(0.5 * float((hi - lo).max()) * 1.35, 0.3 * mov.R)
    return 0.5 * (lo + hi), meia


def fig_instante(mov: Movimento, esc: Escalas, caminho: Path) -> None:
    """Lupa em torno de F (mesma escala fixa da animação) nos dois grupos."""
    fig, axs = plt.subplots(1, 2, figsize=(LARGURA, 0.56 * LARGURA))
    fig.subplots_adjust(0.01, 0.13, 0.99, 0.94, wspace=0.06)
    centro, meia = _janela_instante(mov, esc)
    for ax, grupo, nomes, titulo in ((axs[0], "vel", VELOCIDADES, "Velocidades"),
                                     (axs[1], "acc", ACELERACOES, "Acelerações")):
        vista = VistaTopo(ax, mov, esc, tam=0.6, triedro=False)
        ax.set_xlim(centro[0] - meia, centro[0] + meia)
        ax.set_ylim(centro[1] - meia, centro[1] + meia)
        ax.axis("on")
        ax.set_xticks([])
        ax.set_yticks([])
        for lado in ax.spines.values():
            lado.set(visible=True, color=CINZA_CLARO)
        e = vista.atualizar(mov.t_instante, grupo)
        ax.set_title(rf"{titulo} em $t = {mat(mov.t_instante, 4)}$ s", fontsize=10)
        unid = "m/s" if grupo == "vel" else "m/s²"
        proxies = [Patch(color=CORES[n], label=f"{ROTULOS[n]}  {num(float(e.modulo(n)[0]), 4)} {unid}")
                   for n in nomes]
        ax.legend(handles=proxies, handler_map={Patch: HandlerPatch(patch_func=_seta_legenda)},
                  loc="upper center", bbox_to_anchor=(0.5, 0.02), ncols=2, fontsize=8.5,
                  handlelength=2.0, columnspacing=1.0)
    fig.savefig(caminho)
    plt.close(fig)


def fig_modulos(mov: Movimento, caminho: Path) -> None:
    tt = np.linspace(0, mov.t_f, 1200)
    e = mov.estado(tt)
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(LARGURA, 3.9), sharex=True, constrained_layout=True)
    for ax, nomes, unid in ((a1, VELOCIDADES, "m/s"), (a2, ACELERACOES, r"m/s$^2$")):
        _sombrear_dt(ax, mov)
        for n in nomes:
            ax.plot(tt, e.modulo(n), color=CORES[n], lw=2.4 if n in anim.GROSSOS else 1.6,
                    label=ROTULOS[n].replace("$", "$|", 1)[:-1] + "|$")
        ax.axvline(mov.t_instante, color=TINTA, lw=0.8, ls=(0, (2, 2)))
        ax.set_ylabel(f"módulo [{unid}]")
        ax.set_ylim(bottom=0)
        ax.legend(loc="center left", bbox_to_anchor=(1.0, 0.5), fontsize=9)
        virgula(ax)
    a2.plot(tt, np.linalg.norm(e.a_arr_t, axis=-1), color=CORES["a_arr"], lw=0.9, ls=(0, (1, 1.5)),
            label=r"$|\boldsymbol{\alpha}\wedge\mathbf{OF}|$")
    a2.plot(tt, np.linalg.norm(e.a_arr_n, axis=-1), color=CORES["a_arr"], lw=0.9, ls=(0, (5, 2)),
            label=r"$|\boldsymbol{\omega}\wedge(\boldsymbol{\omega}\wedge\mathbf{OF})|$")
    a2.legend(loc="center left", bbox_to_anchor=(1.0, 0.5), fontsize=9)
    a2.set_xlabel(r"$t$ [s]   (faixas: grupo exibido na animação; tracejado: instante pedido)")
    a2.set_xlim(0, mov.t_f)
    fig.savefig(caminho)
    plt.close(fig)


def quadros_chave(mov: Movimento, maximo: int = 12) -> np.ndarray:
    tk = mov.instantes_dt()
    if len(tk) <= maximo:
        return tk
    return tk[np.unique(np.linspace(0, len(tk) - 1, maximo).round().astype(int))]


def fig_quadros(mov: Movimento, esc: Escalas, caminho: Path) -> None:
    tk = quadros_chave(mov)
    # Mesma janela em todos os painéis: a menor que contém o disco, a seta de ω e as setas.
    pares = [(t, n) for t in tk for n in (VELOCIDADES if grupo_no_instante(float(t), mov.dt) == "vel"
                                          else ACELERACOES)]
    L = _meia_janela(mov, esc, pares, folga=1.36)
    ncol = 3 if len(tk) > 4 else 2
    nlin = int(np.ceil(len(tk) / ncol))
    lado = LARGURA / ncol
    fig, axs = plt.subplots(nlin, ncol, figsize=(LARGURA, nlin * lado * 1.02 + 0.45), squeeze=False)
    fig.subplots_adjust(0, 0.45 / (nlin * lado * 1.02 + 0.45), 1, 0.985, wspace=0.0, hspace=0.12)
    for ax, tt in zip(axs.flat, tk):
        g = grupo_no_instante(float(tt), mov.dt)
        VistaTopo(ax, mov, esc, tam=0.34, rotulos=False, triedro=False).atualizar(float(tt))
        ax.set(xlim=(-L, L), ylim=(-L, L))
        ax.set_title(rf"$t = {mat(tt, 3)}$ s · " + ("velocidades" if g == "vel" else "acelerações"),
                     fontsize=9, color=CORES["v_abs"] if g == "vel" else CORES["a_cor"], pad=1)
    for ax in axs.flat[len(tk):]:
        ax.axis("off")
    legenda_vetores(fig, loc="lower center", ncols=7, fontsize=9, bbox_to_anchor=(0.5, 0.0),
                    columnspacing=1.0)
    fig.savefig(caminho)
    plt.close(fig)


def fig_erros(mov: Movimento, caminho: Path) -> None:
    tt, ev, ea = erros_derivada(mov)
    piso = 1e-17
    fig, ax = plt.subplots(figsize=(LARGURA, 2.3), constrained_layout=True)
    ax.semilogy(tt, np.maximum(ev, piso), color=CORES["v_abs"], lw=1.4,
                label=r"$\mathbf{v}_{\mathrm{abs}}$ vs. $\mathrm{d}\mathbf{OF}/\mathrm{d}t$ numérica")
    ax.semilogy(tt, np.maximum(ea, piso), color=CORES["a_abs"], lw=1.4,
                label=r"$\mathbf{a}_{\mathrm{abs}}$ vs. $\mathrm{d}\mathbf{v}_{\mathrm{abs}}/\mathrm{d}t$ numérica")
    ax.axhline(TOL_DERIVADA, color=CORES["a_cor"], lw=1.0, ls=(0, (4, 2)))
    ax.text(0.01, TOL_DERIVADA * 1.6, "tolerância $10^{-5}$", transform=ax.get_yaxis_transform(),
            fontsize=8.5, color=CORES["a_cor"])
    ax.set(xlim=(0, mov.t_f), ylim=(1e-16, 1e-3), xlabel=r"$t$ [s]", ylabel="erro relativo")
    ax.legend(loc="center right", fontsize=8.5)
    virgula(ax)
    fig.savefig(caminho)
    plt.close(fig)


# ----------------------------------------------------------------------- contexto
def _linhas_instante(mov: Movimento) -> tuple[list[dict], dict]:
    e = mov.estado(np.array([mov.t_instante]))
    esc_v = max(float(e.modulo(n)[0]) for n in VELOCIDADES)
    esc_a = max(float(np.abs(e.polar(n)).max()) for n in ACELERACOES + ("a_arr_t", "a_arr_n"))
    defs = [
        ("v_rel", r"\vb{v}_{\mathrm{rel}}", r"-v\,\vb{e}_r", "vel"),
        ("v_arr", r"\vb{v}_{\mathrm{arr}}", r"\omega r\,\vb{e}_\varphi", "vel"),
        ("v_abs", r"\vb{v}_{\mathrm{abs}}", r"\vb{v}_{\mathrm{rel}}+\vb{v}_{\mathrm{arr}}", "vel"),
        ("a_rel", r"\vb{a}_{\mathrm{rel}}", r"-\dot v\,\vb{e}_r", "acc"),
        ("a_arr", r"\vb{a}_{\mathrm{arr}}", r"\alpha r\,\vb{e}_\varphi-\omega^2 r\,\vb{e}_r", "acc"),
        ("a_arr_t", r"\quad\text{tangencial}", r"\vb*{\alpha}\wedge\vb{OF}", "sub"),
        ("a_arr_n", r"\quad\text{centrípeta}", r"\vb*{\omega}\wedge(\vb*{\omega}\wedge\vb{OF})", "sub"),
        ("a_cor", r"\vb{a}_{\mathrm{cor}}", r"-2\omega v\,\vb{e}_\varphi", "acc"),
        ("a_abs", r"\vb{a}_{\mathrm{abs}}", r"\vb{a}_{\mathrm{rel}}+\vb{a}_{\mathrm{arr}}+\vb{a}_{\mathrm{cor}}", "acc"),
    ]
    linhas = []
    colunas = ("er", "ephi", "i", "j", "mod")
    for nome, simb, expr, tipo in defs:
        esc = esc_v if tipo == "vel" else esc_a
        pol, cart = e.polar(nome)[0], e.cartesiano(nome)[0]
        valores = (pol[0], pol[1], cart[0], cart[1], float(np.linalg.norm(pol)))
        linhas.append(dict(
            simbolo=simb, expr=expr, tipo=tipo, cor=nome.replace("_", "")[:4] if tipo != "sub" else "",
            # Já arredondados a 4 algarismos aqui; o siunitx só alinha (round-mode=none).
            **{k: sig(x, 4, esc) for k, x in zip(colunas, valores)},
            mod_num=latex_num(valores[-1], esc),
            unid=r"\unit{m/s}" if tipo == "vel" else r"\unit{m/s^2}",
        ))
    formatos = [formato_s([l[k] for l in linhas]) for k in colunas]
    s = {k: float(getattr(e, k)[0]) for k in ("t", "r", "phi", "omega", "alpha", "v", "vdot")}
    return linhas, formatos, s


def _contas_instante(s: dict) -> list[str]:
    """Substituição numérica, linha a linha, para o leitor refazer a conta."""
    n = lambda x: latex_num(x)  # noqa: E731
    p = lambda x: rf"({n(x)})" if x < 0 else n(x)  # noqa: E731
    r, w, a, v, vd = s["r"], s["omega"], s["alpha"], s["v"], s["vdot"]
    return [
        rf"\vb{{v}}_{{\mathrm{{rel}}}} &= -v\,\vb{{e}}_r = {n(-v)}\,\vb{{e}}_r \ \unit{{m/s}}",
        rf"\vb{{v}}_{{\mathrm{{arr}}}} &= \omega r\,\vb{{e}}_\varphi = {p(w)}\cdot{p(r)}\,\vb{{e}}_\varphi"
        rf" = {n(w * r)}\,\vb{{e}}_\varphi \ \unit{{m/s}}",
        rf"\vb{{a}}_{{\mathrm{{rel}}}} &= -\dot v\,\vb{{e}}_r = {n(-vd)}\,\vb{{e}}_r \ \unit{{m/s^2}}",
        rf"\vb*{{\alpha}}\wedge\vb{{OF}} &= \alpha r\,\vb{{e}}_\varphi = {p(a)}\cdot{p(r)}\,\vb{{e}}_\varphi"
        rf" = {n(a * r)}\,\vb{{e}}_\varphi \ \unit{{m/s^2}}",
        rf"\vb*{{\omega}}\wedge(\vb*{{\omega}}\wedge\vb{{OF}}) &= -\omega^2 r\,\vb{{e}}_r = -{p(w)}^2\cdot{p(r)}\,\vb{{e}}_r"
        rf" = {n(-w * w * r)}\,\vb{{e}}_r \ \unit{{m/s^2}}",
        rf"\vb{{a}}_{{\mathrm{{cor}}}} &= -2\omega v\,\vb{{e}}_\varphi = -2\cdot{p(w)}\cdot{p(v)}\,\vb{{e}}_\varphi"
        rf" = {n(-2 * w * v)}\,\vb{{e}}_\varphi \ \unit{{m/s^2}}",
    ]


def _tabela_temporal(mov: Movimento) -> list[dict]:
    """Linhas da tabela temporal, com 4 algarismos significativos."""
    tk = mov.instantes_dt()
    e = mov.estado(tk)
    linhas = []
    for k in range(len(tk)):
        linhas.append(dict(
            k=k, grupo="V" if k % 2 == 0 else "A",
            nums=[sig(tk[k], 4, mov.t_f), sig(e.r[k], 4, mov.R), sig(e.phi[k], 4, np.pi)]
                 + [sig(float(e.modulo(n)[k]), 4, 1.0) for n in VETORES],
        ))
    return linhas


def _expr_latex(mov: Movimento) -> dict[str, str]:
    lx = mov.latex()
    lx["omega_dec"] = latex_decimal(mov.omega_expr)
    lx["v_dec"] = latex_decimal(mov.v_expr)
    lx["alpha_dec"] = latex_decimal(sp.simplify(mov.alpha_expr))
    lx["vdot_dec"] = latex_decimal(sp.simplify(mov.vdot_expr))
    lx["phi0"] = sp.latex(mov.phi0_expr)
    lx["R_dec"] = latex_decimal(mov.R_expr)
    return lx


# --------------------------------------------------------------------- compilação
_AVISO = re.compile(r"(LaTeX Warning|Package \S+ Warning|Overfull \\hbox \((\d+\.?\d*)pt|"
                    r"Overfull \\vbox|undefined|Missing character)")


def _avisos_do_log(log: Path) -> list[str]:
    """Avisos relevantes do log; overfull de até 1 pt é tolerado (invisível no papel)."""
    avisos = []
    for linha in log.read_text(errors="replace").splitlines():
        m = _AVISO.search(linha)
        if not m:
            continue
        if m.group(2) and float(m.group(2)) <= 1.0:
            continue
        avisos.append(linha.strip())
    return avisos


def compilar(tex: Path) -> list[str]:
    """Compila com tectonic (baixa sob demanda os pacotes que faltarem) e devolve os avisos."""
    proc = subprocess.run([ferramenta("tectonic"), "--keep-logs", "--chatter", "minimal", tex.name],
                          cwd=tex.parent, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"Falha ao compilar {tex.name}:\n{proc.stdout[-4000:]}\n{proc.stderr[-4000:]}")
    avisos = [l.strip() for l in proc.stderr.splitlines() if l.lower().startswith("warning")]
    return avisos + _avisos_do_log(tex.with_suffix(".log"))


# ---------------------------------------------------------------------- principal
def preparar(mov: Movimento, titulo: str, rotulo: str, descricao: str, nome: str, saida: Path,
             build: Path, video: bool = True) -> dict:
    """Figuras, animação (MP4/GIF/PNG) e checagens de um caso; devolve o contexto do template."""
    aplicar_estilo()
    saida.mkdir(parents=True, exist_ok=True)
    build.mkdir(parents=True, exist_ok=True)
    fig_dir = build / "fig"
    fig_dir.mkdir(exist_ok=True)
    esc = Escalas.calcular(mov)
    lx = _expr_latex(mov)

    fig_resumo(mov, esc, fig_dir / "resumo.pdf")
    fig_lei(mov, fig_dir / "lei.pdf")
    fig_trajetorias(mov, fig_dir / "trajetorias.pdf")
    fig_instante(mov, esc, fig_dir / "instante.pdf")
    fig_modulos(mov, fig_dir / "modulos.pdf")
    fig_quadros(mov, esc, fig_dir / "quadros.pdf")
    fig_erros(mov, fig_dir / "erros.pdf")

    mp4 = saida / f"animacao_{nome}.mp4" if video else None
    gif = saida / f"animacao_{nome}.gif" if video else None
    dt_mat = f"{mov.dt:g}".replace(".", "{,}")
    dados = (rf"$\omega(t) = {lx['omega_dec']}$ rad/s      $v(t) = {lx['v_dec']}$ m/s",
             rf"$R = {lx['R_dec']}$ m      $\varphi_0 = {lx['phi0']}$ rad      $\Delta t = {dt_mat}$ s")
    quadros = anim.gerar_animacao(mov, esc, f"Carrossel e formiga · {titulo}", rotulo, dados,
                                  mp4=mp4, gif=gif, pasta_quadros=build / "quadros")
    n_alt, alt_ok = anim.conferir_alternancia(mov, esc)

    checagens = verificar(mov)
    linhas, fmt_instante, s = _linhas_instante(mov)
    temporal = _tabela_temporal(mov)
    return dict(
        titulo=titulo, rotulo=rotulo, descricao=descricao, nome=nome, mov=mov, lx=lx, s=s,
        n=latex_num, bruto=bruto, num=num, linhas=linhas, contas=_contas_instante(s),
        fmt_instante=fmt_instante, temporal=temporal,
        dt_txt=f"{mov.dt:g}", checagens=checagens, n_alt=n_alt, alt_ok=alt_ok,
        tudo_ok=alt_ok and all(c.aprovado for c in checagens),
        n_quadros=len(quadros), fps_quadros=10, fator=anim.velocidade_reproducao(mov.t_f),
        escala_v=esc.texto(mov.R)[0].replace("≙", r"$\widehat{=}$"),
        escala_a=esc.texto(mov.R)[1].replace("≙", r"$\widehat{=}$").replace("²", r"\textsuperscript{2}"),
        mp4=mp4.name if mp4 else None, gif=gif.name if gif else None,
        n_quadros_chave=len(quadros_chave(mov)), omega_neg=_intervalos_omega_negativa(mov),
        cores=CORES, build=build, dados=dados, caminho_mp4=mp4, caminho_gif=gif,
    )


def _ambiente() -> Environment:
    return Environment(
        loader=FileSystemLoader(TEMPLATES), undefined=StrictUndefined, autoescape=False,
        block_start_string=r"\BLOCK{", block_end_string="}", variable_start_string=r"\VAR{",
        variable_end_string="}", comment_start_string=r"\#{", comment_end_string="}",
        line_statement_prefix="%%", line_comment_prefix="%#", trim_blocks=True, lstrip_blocks=True,
    )


def escrever_pdf(ctxs: list[dict], tex: Path, pdf: Path, animado: bool = True) -> list[str]:
    """Um documento com o modelo uma vez só e os itens de cada caso (seções, ou subseções se
    houver mais de um caso). Devolve os avisos do LaTeX. Com ``animado=False`` o PDF é
    estático: sem o pacote animate, a seção (d) traz só os quadros-chave e aponta os vídeos.

    O documento conjunto é compilado como um todo, e não colando os PDFs prontos: assim cada
    animação do pacote animate mantém seu JavaScript e seus botões.
    """
    env = _ambiente()
    nivel = r"\section" if len(ctxs) == 1 else r"\subsection"
    casos = []
    for ctx in ctxs:
        # Caminho das figuras e quadros do caso relativo à pasta do .tex.
        c = dict(ctx, H=nivel, animado=animado,
                 dir=Path(os.path.relpath(ctx["build"], tex.parent)).as_posix())
        casos.append(dict(c, resumo=env.get_template("caso_resumo.tex.j2").render(**c),
                          itens=env.get_template("caso_itens.tex.j2").render(**c)))
    titulo_pdf = ctxs[0]["titulo"] if len(ctxs) == 1 else "relatório conjunto"
    tex.write_text(env.get_template("documento.tex.j2").render(
        casos=casos, cores=CORES, n=latex_num, titulo_pdf=titulo_pdf, animado=animado),
        encoding="utf-8")
    avisos = compilar(tex)
    shutil.copyfile(tex.with_suffix(".pdf"), pdf)
    return avisos


def gerar(mov: Movimento, titulo: str, rotulo: str, descricao: str, nome: str, saida: Path,
          build: Path, video: bool = True) -> Resultado:
    """Gera figuras, animação, PDF e (opcionalmente) MP4/GIF de um caso."""
    ctx = preparar(mov, titulo, rotulo, descricao, nome, saida, build, video)
    pdf = saida / f"relatorio_{nome}.pdf"
    avisos = escrever_pdf([ctx], build / f"relatorio_{nome}.tex", pdf)
    return Resultado(pdf=pdf, mp4=ctx["caminho_mp4"], gif=ctx["caminho_gif"], avisos_latex=avisos,
                     checagens_ok=ctx["tudo_ok"], ctx=ctx)


def gerar_conjunto(resultados: list[Resultado], saida: Path, build: Path) -> Resultado:
    """Junta os casos num só PDF e, se houver vídeos, num só MP4 com um cartão antes de cada caso."""
    ctxs = [r.ctx for r in resultados]
    pdf = saida / "relatorio_todos.pdf"
    # Estático: as animações ficam nos relatórios individuais e no animacao_todos.mp4.
    avisos = escrever_pdf(ctxs, build / "relatorio_todos.tex", pdf, animado=False)
    mp4 = None
    if all(c["caminho_mp4"] for c in ctxs):
        mp4 = saida / "animacao_todos.mp4"
        partes = []
        for i, c in enumerate(ctxs, 1):
            cartao = build / f"cartao_{c['nome']}.png"
            anim.cartao(cartao, c["titulo"], c["rotulo"], c["dados"], i, len(ctxs))
            partes.append((cartao, c["caminho_mp4"]))
        anim.juntar_videos(partes, mp4)
    return Resultado(pdf=pdf, mp4=mp4, gif=None, avisos_latex=avisos,
                     checagens_ok=all(c["tudo_ok"] for c in ctxs))
