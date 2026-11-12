"""Item 1.2: a animação da geração da hipocicloide, em GIF e MP4."""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

import numpy as np

from .estilo import CINZA, CORES, PAPEL, aplicar_estilo
from .formatacao import mat
from .modelo import Hipocicloide

import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.animation import FFMpegWriter, FuncAnimation, PillowWriter  # noqa: E402
from matplotlib.patches import Circle  # noqa: E402


def ferramenta(nome: str) -> str:
    """Executável no PATH ou no ambiente Python ativo (conda/micromamba sem ``activate``)."""
    caminho = shutil.which(nome) or shutil.which(nome, path=str(Path(sys.prefix) / "bin"))
    if caminho is None:
        raise RuntimeError(f"'{nome}' não encontrado. Instale-o (ex.: micromamba install {nome}).")
    return caminho


def gravar(h: Hipocicloide, gif: Path | None, mp4: Path | None, quadros: int = 240, fps: int = 30) -> None:
    """Disco rolando, raio CP, centro instantâneo I e o traço de P."""
    aplicar_estilo()
    fig, ax = plt.subplots(figsize=(5.4, 5.4))
    fig.patch.set_facecolor(PAPEL)
    ax.set_facecolor(PAPEL)
    L = 1.08 * h.R
    ax.set(xlim=(-L, L), ylim=(-L, L), aspect="equal")
    ax.axis("off")
    fig.subplots_adjust(0, 0, 1, 1)
    ax.add_patch(Circle((0, 0), h.R, fill=False, ec=CORES["aro"], lw=1.0, ls=(0, (4, 3))))
    disco = Circle((0, 0), h.r, fill=False, ec=CORES["disco"], lw=1.6)
    ax.add_patch(disco)
    (raio,) = ax.plot([], [], color=CORES["disco"], lw=1.1)
    (ip,) = ax.plot([], [], color=CINZA, lw=0.9, ls=(0, (2, 2)))
    (traco,) = ax.plot([], [], color=CORES["curva"], lw=1.8)
    (ponto,) = ax.plot([], [], "o", ms=6, color=CORES["ponto"], zorder=5)
    (contato,) = ax.plot([], [], "o", ms=4.5, mfc="white", mec="black", mew=1, zorder=5)
    rotulo = ax.text(0.02, 0.97, "", transform=ax.transAxes, va="top", fontsize=11, color=CINZA)

    th = np.linspace(0, h.theta_max, quadros)
    xy = h.posicao(np.linspace(0, h.theta_max, quadros * 8))

    def quadro(i: int):  # noqa: ANN202
        C, P, I = h.centro_disco(th[i]), h.posicao(th[i]), h.contato(th[i])
        disco.center = tuple(C)
        raio.set_data([C[0], P[0]], [C[1], P[1]])
        ip.set_data([I[0], P[0]], [I[1], P[1]])
        traco.set_data(xy[: i * 8 + 1, 0], xy[: i * 8 + 1, 1])
        ponto.set_data([P[0]], [P[1]])
        contato.set_data([I[0]], [I[1]])
        rotulo.set_text(rf"$R/r = {mat(h.R / h.r, 4)}$    $\theta = {mat(th[i], 3)}$ rad")
        return disco, raio, ip, traco, ponto, contato, rotulo

    anim = FuncAnimation(fig, quadro, frames=quadros, blit=True)
    if gif is not None:
        anim.save(gif, writer=PillowWriter(fps=fps), dpi=90)
    if mp4 is not None:
        plt.rcParams["animation.ffmpeg_path"] = ferramenta("ffmpeg")
        anim.save(mp4, writer=FFMpegWriter(fps=fps, codec="libx264", extra_args=["-pix_fmt", "yuv420p"]), dpi=160)
    plt.close(fig)
