"""Animação em vista de topo (item d): carrossel girando, formiga F e vetores a cada Δt.

``VistaTopo`` desenha a cena num ``Axes`` qualquer e é reutilizada pelas figuras
estáticas do relatório; ``Cena`` monta o quadro completo do vídeo (vista + painel
de informações + linha do tempo); ``gerar_animacao`` grava MP4, GIF e os PNG que o
pacote ``animate`` embute no PDF.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib.animation import FFMpegWriter  # noqa: E402
from matplotlib.collections import LineCollection  # noqa: E402
from matplotlib.colors import to_rgba  # noqa: E402
from matplotlib.patches import Circle, FancyArrowPatch, Polygon, Rectangle, Wedge  # noqa: E402
from matplotlib.path import Path as MplPath  # noqa: E402
from matplotlib.transforms import Affine2D  # noqa: E402

from .estilo import (  # noqa: E402
    CINZA, CINZA_CLARO, CORES, DISCO, FUNDO_ACC, FUNDO_VEL, NOMES, ROTULOS, SETOR, TINTA,
    aplicar_estilo,
)
from .formatacao import num  # noqa: E402
from .modelo import ACELERACOES, VELOCIDADES, Estado, Movimento, grupo_no_instante  # noqa: E402

# O maior vetor de cada grupo ocupa esta fração de R durante TODA a animação.
FRACAO_MAIOR_VETOR = 0.6
# Meia-largura da janela em unidades de R: |OF| ≤ R e seta ≤ 0,6 R ⇒ ponta ≤ 1,6 R.
MEIA_JANELA = 1.72
GROSSOS = {"v_abs", "a_abs"}


def ferramenta(nome: str) -> str:
    """Executável no PATH ou no ambiente Python ativo (conda/micromamba sem ``activate``)."""
    caminho = shutil.which(nome) or shutil.which(nome, path=str(Path(sys.prefix) / "bin"))
    if caminho is None:
        raise RuntimeError(f"'{nome}' não encontrado. Instale-o (ex.: micromamba install {nome}).")
    return caminho


@dataclass(frozen=True)
class Escalas:
    """Escala fixa (metros de seta por unidade física) para velocidades e acelerações.

    É fixa de propósito: com escala variável por quadro, uma seta poderia crescer na
    tela enquanto o vetor diminui, e o leitor perderia a comparação entre instantes.
    """

    vel: float
    acc: float
    v_max: float
    a_max: float

    @classmethod
    def calcular(cls, mov: Movimento, fracao: float = FRACAO_MAIOR_VETOR) -> Escalas:
        e = mov.estado(np.linspace(0.0, mov.t_f, 4001))
        v_max = max(float(e.modulo(n).max()) for n in VELOCIDADES)
        a_max = max(float(e.modulo(n).max()) for n in ACELERACOES)
        alvo = fracao * mov.R
        return cls(vel=alvo / v_max if v_max > 0 else 1.0,
                   acc=alvo / a_max if a_max > 0 else 1.0, v_max=v_max, a_max=a_max)

    def de(self, nome: str) -> float:
        return self.vel if nome in VELOCIDADES else self.acc

    def texto(self, R: float) -> tuple[str, str]:
        """Quanto vale uma seta de comprimento R em cada grupo."""
        return (f"seta de 1 R ≙ {num(R / self.vel, 3)} m/s",
                f"seta de 1 R ≙ {num(R / self.acc, 3)} m/s²")


class VistaTopo:
    """Carrossel, formiga e vetores vistos de cima, num Axes com escala igual nos eixos."""

    def __init__(self, ax: plt.Axes, mov: Movimento, escalas: Escalas, *, tam: float = 1.0,
                 rotulos: bool = True, triedro: bool = True, rastro: bool = True,
                 paralelogramo: bool = True) -> None:
        self.ax, self.mov, self.esc, self.tam = ax, mov, escalas, tam
        self.rotulos, self.com_paralelogramo = rotulos, paralelogramo
        R = mov.R
        L = MEIA_JANELA * R
        ax.set_xlim(-L, L)
        ax.set_ylim(-L, L)
        ax.set_aspect("equal")
        ax.axis("off")

        self._omega_ref = max(float(np.abs(mov.omega(np.linspace(0, mov.t_f, 2001))).max()), 1e-12)
        self._montar_carrossel(R)
        if triedro:
            self._montar_triedro(R)
        self._montar_seta_omega(R)

        self._rastro = None
        if rastro:
            self._tt_rastro = np.linspace(0.0, mov.t_f, 1500)
            self._xy_rastro = mov.estado(self._tt_rastro).posicao
            self._rastro = LineCollection([], linewidths=2.2 * tam, capstyle="round", zorder=4)
            ax.add_collection(self._rastro)

        self._formiga, = ax.plot([], [], "o", ms=13 * tam, mfc=TINTA, mec="white",
                                 mew=1.8 * tam, zorder=12)
        # Rótulos com deslocamento em pontos (não em metros): continuam colados ao objeto
        # quando a figura do relatório amplia a vista em torno de F.
        self._rotulo_f = ax.annotate("F", (0, 0), xytext=(0, 0), textcoords="offset points",
                                     fontsize=17 * tam, fontweight="bold", color=TINTA,
                                     ha="center", va="center", zorder=13, annotation_clip=True)

        self.setas: dict[str, FancyArrowPatch] = {}
        self.textos: dict[str, plt.Text] = {}
        for nome in VELOCIDADES + ACELERACOES:
            grosso = nome in GROSSOS
            seta = FancyArrowPatch((0, 0), (1, 0), arrowstyle="-|>", shrinkA=0, shrinkB=0,
                                   color=CORES[nome], lw=(3.6 if grosso else 2.2) * tam,
                                   mutation_scale=(20 if grosso else 15) * tam,
                                   joinstyle="miter", zorder=10 if grosso else 9, visible=False)
            ax.add_patch(seta)
            self.setas[nome] = seta
            self.textos[nome] = ax.annotate(ROTULOS[nome], (0, 0), xytext=(0, 0),
                                            textcoords="offset points", fontsize=15 * tam,
                                            color=CORES[nome], ha="center", va="center", zorder=14,
                                            visible=False, annotation_clip=True)
        self._para = [ax.plot([], [], ls=(0, (3, 3)), lw=1.1 * tam, color=CINZA, zorder=8)[0]
                      for _ in range(2)]
        self.vetores_exibidos: tuple[str, ...] = ()
        self.grupo = "vel"

    # -- montagem ------------------------------------------------------------------
    def _montar_carrossel(self, R: float) -> None:
        """Peças desenhadas no referencial do carrossel (reta da formiga ao longo de +x)."""
        ax, tam = self.ax, self.tam
        self._giro = []
        disco = Circle((0, 0), R, fc=DISCO, ec=TINTA, lw=2.4 * tam, zorder=1)
        # Setor colorido: detalhe assimétrico que torna a rotação legível mesmo com ω pequeno.
        setor = Wedge((0, 0), R, 200, 245, fc=SETOR, ec="none", zorder=1.5)
        self._giro += [disco, setor]
        for k in range(8):
            ang = np.pi / 8 + k * np.pi / 4  # raios fora da reta da formiga
            ln, = ax.plot([0.08 * R * np.cos(ang), R * np.cos(ang)],
                          [0.08 * R * np.sin(ang), R * np.sin(ang)],
                          color=CINZA_CLARO, lw=1.4 * tam, zorder=2)
            self._giro.append(ln)
        reta, = ax.plot([0, R], [0, 0], color=TINTA, lw=1.9 * tam, ls=(0, (6, 4)), zorder=3)
        marca = Polygon([[R, 0], [R * 1.07, 0.035 * R], [R * 1.07, -0.035 * R]],
                        closed=True, fc=TINTA, ec="none", zorder=3)
        cubo = Circle((0, 0), 0.06 * R, fc="white", ec=TINTA, lw=1.4 * tam, zorder=5)
        self._giro += [reta, marca, cubo]
        for p in self._giro:
            if isinstance(p, (Circle, Wedge, Polygon)):
                ax.add_patch(p)
        ax.annotate("O", (0, 0), xytext=(13 * tam, -13 * tam), textcoords="offset points",
                    fontsize=14 * tam, color=TINTA, zorder=6, style="italic", ha="center",
                    va="center", annotation_clip=True)

    def _montar_triedro(self, R: float) -> None:
        """Referencial fixo (O, i, j, k) num canto: k sai do papel (⊙)."""
        ax, tam = self.ax, self.tam
        x0, y0, c = -1.56 * R, -1.52 * R, 0.28 * R
        for (dx, dy), rot in (((c, 0), "i"), ((0, c), "j")):
            ax.add_patch(FancyArrowPatch((x0, y0), (x0 + dx, y0 + dy), arrowstyle="-|>",
                                         mutation_scale=11 * tam, lw=1.3 * tam, color=CINZA))
            ax.text(x0 + dx * 1.18 + (0 if dx else 0.05 * R), y0 + dy * 1.18 + (0.04 * R if dx else 0),
                    rf"$\mathbf{{{rot}}}$", fontsize=13 * tam, color=CINZA, ha="center", va="center")
        ax.add_patch(Circle((x0, y0), 0.035 * R, fc="white", ec=CINZA, lw=1.1 * tam, zorder=3))
        ax.plot([x0], [y0], ".", color=CINZA, ms=3.5 * tam, zorder=4)
        ax.text(x0 - 0.06 * R, y0, r"$\mathbf{k}$", fontsize=13 * tam, color=CINZA,
                ha="right", va="center")

    def _montar_seta_omega(self, R: float) -> None:
        """Seta curva fixa no espaço indicando o sentido de ω (anti-horário se ω > 0)."""
        ang = np.linspace(np.radians(58), np.radians(122), 60)
        raio = 1.14 * R
        xy = np.column_stack([raio * np.cos(ang), raio * np.sin(ang)])
        estilo = dict(arrowstyle="-|>", mutation_scale=17 * self.tam, lw=2.0 * self.tam,
                      color=TINTA, zorder=6)
        self._omega_anti = FancyArrowPatch(path=MplPath(xy), **estilo)
        self._omega_hor = FancyArrowPatch(path=MplPath(xy[::-1]), **estilo)
        for p in (self._omega_anti, self._omega_hor):
            self.ax.add_patch(p)
        self._omega_txt = self.ax.text(0, 1.27 * R, "", fontsize=14 * self.tam, color=TINTA,
                                       ha="center", va="center")

    # -- atualização ---------------------------------------------------------------
    def atualizar(self, tt: float, grupo: str | None = None) -> Estado:
        """Desenha o instante t; ``grupo`` força "vel"/"acc" (por padrão, a regra de Δt)."""
        mov, R = self.mov, self.mov.R
        grupo = grupo or grupo_no_instante(tt, mov.dt)
        e = mov.estado(np.array([tt]))
        phi = float(e.phi[0])
        giro = Affine2D().rotate(phi) + self.ax.transData
        for p in self._giro:
            p.set_transform(giro)

        w = float(e.omega[0])
        parado = abs(w) < 1e-3 * self._omega_ref
        self._omega_anti.set_visible(not parado and w > 0)
        self._omega_hor.set_visible(not parado and w < 0)
        self._omega_txt.set_text(r"$\omega \approx 0$" if parado else r"$\boldsymbol{\omega}$")

        if self._rastro is not None:
            n = int(np.searchsorted(self._tt_rastro, tt, side="right"))
            pts = np.vstack([self._xy_rastro[:n], e.posicao[0]])
            seg = np.stack([pts[:-1], pts[1:]], axis=1)
            idade = np.linspace(0.0, 1.0, max(len(seg), 1))  # 0 = mais antigo
            cores = np.tile(to_rgba("#3B4A5A"), (len(seg), 1))
            cores[:, 3] = 0.10 + 0.85 * idade[: len(seg)] ** 1.4
            self._rastro.set_segments(seg)
            self._rastro.set_color(cores)

        F = e.posicao[0]
        self._formiga.set_data([F[0]], [F[1]])
        # Rótulo "F" do lado de fora, oposto ao centro, para não cobrir as setas.
        rad = F / np.linalg.norm(F) if np.linalg.norm(F) > 1e-9 else np.array([1.0, 0.0])
        lateral = np.array([-rad[1], rad[0]])
        self._rotulo_f.xy = tuple(F)
        self._rotulo_f.set_position(tuple(-15 * self.tam * lateral - 6 * self.tam * rad))

        nomes = VELOCIDADES if grupo == "vel" else ACELERACOES
        self.grupo, self.vetores_exibidos = grupo, nomes
        pontas: dict[str, np.ndarray] = {}
        px_por_m = self._px_por_metro()
        for nome, seta in self.setas.items():
            txt = self.textos[nome]
            if nome not in nomes:
                seta.set_visible(False)
                txt.set_visible(False)
                continue
            vet = e.cartesiano(nome)[0] * self.esc.de(nome)
            comp = float(np.linalg.norm(vet))
            ponta = F + vet
            pontas[nome] = ponta
            if comp < 1e-4 * R:  # vetor nulo: não há seta a desenhar
                seta.set_visible(False)
                txt.set_visible(False)
                continue
            seta.set_positions(tuple(F), tuple(ponta))
            # Seta curta: reduz a cabeça para não ficar maior que o próprio vetor.
            base = (20 if nome in GROSSOS else 15) * self.tam
            comp_pt = comp * px_por_m * 72.0 / self.ax.figure.dpi
            seta.set_mutation_scale(min(base, 0.9 * comp_pt))
            seta.set_visible(True)
            txt.xy = tuple(ponta)
            txt.set_position(tuple(13 * self.tam * vet / comp))  # pontos além da ponta
            txt.set_visible(self.rotulos)

        mostrar_para = self.com_paralelogramo and grupo == "vel" and all(
            np.linalg.norm(pontas[n] - F) > 0.02 * R for n in ("v_rel", "v_arr"))
        for linha, (a, b) in zip(self._para, (("v_rel", "v_abs"), ("v_arr", "v_abs"))):
            if mostrar_para:
                linha.set_data([pontas[a][0], pontas[b][0]], [pontas[a][1], pontas[b][1]])
            linha.set_visible(mostrar_para)
        return e

    def _px_por_metro(self) -> float:
        x0 = self.ax.transData.transform((0.0, 0.0))
        x1 = self.ax.transData.transform((1.0, 0.0))
        return float(abs(x1[0] - x0[0]))


class PainelInfo:
    """Painel lateral do vídeo: estado escalar e os módulos dos dois grupos, lado a lado."""

    def __init__(self, fig: plt.Figure, rect: tuple[float, float, float, float], mov: Movimento,
                 escalas: Escalas) -> None:
        self.mov = mov
        ax = fig.add_axes(rect)
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.axis("off")
        self.ax = ax
        fs = 13.5
        linhas = [("t", "s"), ("r", "m"), (r"\varphi", "rad"), (r"\omega", "rad/s"), ("v", "m/s")]
        self._val: list[plt.Text] = []
        y = 0.97
        for simb, unid in linhas:
            ax.text(0.02, y, rf"${simb}$", fontsize=fs + 1, color=TINTA, va="center")
            self._val.append(ax.text(0.50, y, "", fontsize=fs, color=TINTA, va="center", ha="right"))
            ax.text(0.53, y, unid, fontsize=fs - 1, color=CINZA, va="center")
            y -= 0.062
        self._extra = ax.text(0.98, 0.97 - 0.062 * 2, "", fontsize=fs - 2, color=CINZA,
                              va="center", ha="right")
        self._sentido = ax.text(0.98, 0.97 - 0.062 * 3, "", fontsize=fs - 2, color=CINZA,
                                va="center", ha="right")

        # Dois quadros lado a lado, sempre preenchidos: as setas na cena alternam a cada Δt,
        # mas os módulos de velocidades e acelerações ficam visíveis o tempo todo. O quadro
        # cujas setas estão na cena ganha borda colorida e a marca "setas na cena".
        ev, ea = escalas.texto(mov.R)
        topo, base, larg = 0.66, 0.075, 0.485
        self._quadros: dict[str, tuple[Rectangle, plt.Text, str]] = {}
        self._valores: dict[str, plt.Text] = {}
        for chave, nomes, x0, fundo, cor, titulo, escala in (
                ("vel", VELOCIDADES, 0.0, FUNDO_VEL, CORES["v_abs"], "VELOCIDADES", ev),
                ("acc", ACELERACOES, 1.0 - larg, FUNDO_ACC, CORES["a_cor"], "ACELERAÇÕES", ea)):
            ax.add_patch(Rectangle((x0, topo - 0.075), larg, 0.075, fc=fundo, ec="none"))
            moldura = Rectangle((x0, base), larg, topo - base, fc="none", ec=CINZA_CLARO, lw=1.2)
            ax.add_patch(moldura)
            ax.text(x0 + larg / 2, topo - 0.0375, titulo, fontsize=fs, fontweight="bold",
                    color=TINTA, ha="center", va="center")
            marca = ax.text(x0 + larg / 2, base - 0.04, "▲ setas na cena", fontsize=fs - 2.5,
                            color=cor, ha="center", va="center")
            self._quadros[chave] = (moldura, marca, cor)
            y = topo - 0.13
            for nome in nomes:
                grosso = nome in GROSSOS
                ax.add_patch(FancyArrowPatch((x0 + 0.02, y), (x0 + 0.095, y), arrowstyle="-|>",
                                             color=CORES[nome], lw=3.4 if grosso else 2.2,
                                             mutation_scale=18 if grosso else 14))
                ax.text(x0 + 0.115, y, ROTULOS[nome], fontsize=fs + 1, color=TINTA, va="center")
                ax.text(x0 + 0.115, y - 0.042, NOMES[nome], fontsize=fs - 3.5, color=CINZA,
                        va="center")
                self._valores[nome] = ax.text(x0 + larg - 0.02, y, "", fontsize=fs, color=TINTA,
                                              va="center", ha="right")
                y -= 0.11
            ax.text(x0 + 0.02, base + 0.03, escala, fontsize=fs - 3.5, color=CINZA, va="center")

    def atualizar(self, e: Estado, grupo: str) -> None:
        t, r, phi, w, v = (float(x[0]) for x in (e.t, e.r, e.phi, e.omega, e.v))
        for txt, x in zip(self._val, (t, r, phi, w, v)):
            txt.set_text(num(x, 4))
        self._extra.set_text(f"({num(np.degrees(phi), 4)}°)")
        self._sentido.set_text("anti-horário" if w > 0 else "horário" if w < 0 else "parado")
        for nome, val in self._valores.items():
            unid = "m/s" if nome in VELOCIDADES else "m/s²"
            val.set_text(f"{num(float(e.modulo(nome)[0]), 4)} {unid}")
        for chave, (moldura, marca, cor) in self._quadros.items():
            ativo = chave == grupo
            moldura.set_edgecolor(cor if ativo else CINZA_CLARO)
            moldura.set_linewidth(2.6 if ativo else 1.2)
            marca.set_visible(ativo)


class LinhaTempo:
    """Faixa [0, t_f] com os intervalos de Δt (velocidades/acelerações) e o cursor de t."""

    def __init__(self, fig: plt.Figure, rect: tuple[float, float, float, float], mov: Movimento) -> None:
        ax = fig.add_axes(rect)
        ax.set_xlim(0, mov.t_f)
        ax.set_ylim(0, 1)
        ax.grid(False)
        for lado in ("left", "right", "top"):
            ax.spines[lado].set_visible(False)
        ax.set_yticks([])
        marcas = mov.instantes_dt()
        for k, t0 in enumerate(marcas):
            t1 = min(t0 + mov.dt, mov.t_f)
            if t1 <= t0:
                continue
            ax.add_patch(Rectangle((t0, 0.15), t1 - t0, 0.7, ec="white", lw=1.5,
                                   fc=FUNDO_VEL if k % 2 == 0 else FUNDO_ACC))
            if (t1 - t0) / mov.t_f > 0.035:
                ax.text((t0 + t1) / 2, 0.5, "V" if k % 2 == 0 else "A", ha="center", va="center",
                        fontsize=10.5, color=CORES["v_abs"] if k % 2 == 0 else CORES["a_cor"])
        passo = max(1, int(np.ceil(len(marcas) / 12)))
        ax.set_xticks(marcas[::passo])
        ax.set_xticklabels([f"{x:g}".replace(".", ",") for x in marcas[::passo]], fontsize=10.5)
        ax.set_xlabel("t [s]   (múltiplos de Δt; V = velocidades, A = acelerações)", fontsize=10.5,
                      color=CINZA)
        self._cursor = ax.axvline(0, color=TINTA, lw=2.2)

    def atualizar(self, tt: float) -> None:
        self._cursor.set_xdata([tt, tt])


class Cena:
    """Quadro completo do vídeo, 16:9."""

    def __init__(self, mov: Movimento, escalas: Escalas, titulo: str, subtitulo: str,
                 dados: tuple[str, str]) -> None:
        aplicar_estilo()
        # 13,33 × 7,5 pol a 144 dpi = 1920 × 1080. Polegadas menores que 16 × 9 deixam o
        # texto ~20 % maior em relação ao quadro, legível também no PDF (16 cm de largura).
        self.fig = plt.figure(figsize=(1920 / 144, 1080 / 144), facecolor="white")
        lado = 9 / 16
        # Sem rótulos nas pontas: com a formiga perto do centro eles se sobrepõem; a
        # legenda lateral (sempre visível) identifica as cores.
        self.vista = VistaTopo(self.fig.add_axes((0.005, 0.0, lado, 1.0)), mov, escalas,
                               rotulos=False)
        self.fig.text(0.585, 0.958, titulo, fontsize=21, color=TINTA, fontweight="bold", va="center")
        self.fig.text(0.585, 0.912, subtitulo, fontsize=14.5, color=TINTA, va="center")
        self.fig.text(0.585, 0.872, dados[0], fontsize=13, color=CINZA, va="center")
        self.fig.text(0.585, 0.836, dados[1], fontsize=13, color=CINZA, va="center")
        self.painel = PainelInfo(self.fig, (0.585, 0.165, 0.405, 0.645), mov, escalas)
        self.linha = LinhaTempo(self.fig, (0.595, 0.07, 0.385, 0.055), mov)

    def atualizar(self, tt: float, grupo: str | None = None) -> Estado:
        e = self.vista.atualizar(tt, grupo)
        self.painel.atualizar(e, self.vista.grupo)
        self.linha.atualizar(tt)
        return e


def velocidade_reproducao(t_f: float) -> float:
    """Fator tempo físico / tempo de vídeo: tempo real se t_f ∈ [6, 30] s, senão ajusta."""
    return t_f / float(np.clip(t_f, 6.0, 30.0))


def gerar_animacao(mov: Movimento, escalas: Escalas, titulo: str, subtitulo: str,
                   dados: tuple[str, str], *,
                   mp4: Path | None, gif: Path | None, pasta_quadros: Path,
                   fps: int = 30, fps_quadros: int = 10, dpi: int = 144,
                   dpi_quadros: int = 84) -> list[Path]:
    """Grava o vídeo e os quadros PNG (para o ``animate`` do LaTeX e o GIF).

    Os PNG são um subconjunto dos quadros do vídeo (1 a cada fps/fps_quadros), então
    vídeo, GIF e PDF mostram exatamente a mesma animação.
    """
    from PIL import Image

    pasta_quadros.mkdir(parents=True, exist_ok=True)
    for velho in pasta_quadros.glob("q-*.png"):
        velho.unlink()
    cena = Cena(mov, escalas, titulo, subtitulo, dados)
    fator = velocidade_reproducao(mov.t_f)
    n = int(round(mov.t_f / fator * fps)) + 1
    tempos = np.linspace(0.0, mov.t_f, n)
    salto = max(1, fps // fps_quadros)
    quadros: list[Path] = []

    plt.rcParams["animation.ffmpeg_path"] = ferramenta("ffmpeg")
    writer = FFMpegWriter(fps=fps, codec="libx264", bitrate=-1,
                          extra_args=["-pix_fmt", "yuv420p", "-crf", "20", "-preset", "medium"])
    contexto = writer.saving(cena.fig, str(mp4), dpi) if mp4 else _Nulo()
    with contexto:
        for i, tt in enumerate(tempos):
            cena.atualizar(float(tt))
            if mp4:
                writer.grab_frame()
            if i % salto == 0 or i == n - 1:
                caminho = pasta_quadros / f"q-{len(quadros):04d}.png"
                cena.fig.savefig(caminho, dpi=dpi_quadros, facecolor="white")
                # Paleta de 256 cores: o PDF com ~100 quadros fica ~3× menor, sem perda visível.
                Image.open(caminho).convert("RGB").quantize(256, dither=Image.Dither.NONE).save(
                    caminho, optimize=True)
                quadros.append(caminho)
        if mp4:  # 1 s parado no fim, para o leitor ver o estado final
            for _ in range(fps):
                writer.grab_frame()
    plt.close(cena.fig)

    if gif:
        filtro = ("fps=10,scale=960:-1:flags=lanczos,split[s0][s1];"
                  "[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4")
        subprocess.run([ferramenta("ffmpeg"), "-y", "-loglevel", "error", "-framerate",
                        str(fps_quadros), "-i", str(pasta_quadros / "q-%04d.png"),
                        "-vf", filtro, "-loop", "0", str(gif)], check=True)
    return quadros


class _Nulo:
    def __enter__(self) -> None:
        return None

    def __exit__(self, *_: object) -> None:
        return None


def conferir_alternancia(mov: Movimento, escalas: Escalas) -> tuple[int, bool]:
    """Confere, nos quadros realmente desenhados, a regra de alternância por Δt.

    Em cada intervalo [kΔt, (k+1)Δt) testa o início, o meio e o fim: as setas visíveis
    devem ser exatamente os vetores não nulos do grupo do k (velocidades se k par,
    acelerações se ímpar), e nenhuma do outro grupo. Devolve (quadros testados, ok).
    """
    fig, ax = plt.subplots(figsize=(4, 4))
    vista = VistaTopo(ax, mov, escalas, rastro=False)
    testados, ok = 0, True
    for k, t0 in enumerate(mov.instantes_dt()):
        t1 = min(t0 + mov.dt, mov.t_f)
        for tt in sorted({t0, 0.5 * (t0 + t1), max(t0, t1 - 1e-6 * mov.dt)}):
            e = vista.atualizar(float(tt))
            grupo = VELOCIDADES if k % 2 == 0 else ACELERACOES
            nao_nulos = {n for n in grupo if e.modulo(n)[0] * escalas.de(n) >= 1e-4 * mov.R}
            visiveis = {n for n, s in vista.setas.items() if s.get_visible()}
            ok &= visiveis == nao_nulos and vista.vetores_exibidos == grupo
            testados += 1
    plt.close(fig)
    return testados, ok
