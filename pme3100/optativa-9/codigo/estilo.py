"""Estilo das figuras: mesma tipografia do PDF e cor fixa para cada caso."""

from __future__ import annotations

import sys
from pathlib import Path

import matplotlib as mpl
from matplotlib import font_manager
from matplotlib.colors import LinearSegmentedColormap, to_rgb
from matplotlib.ticker import FuncFormatter

# Okabe-Ito, seguro para daltônicos. A cor segue o caso em todas as figuras.
COR_CASO = {"A": "#0072B2", "B": "#009E73", "C": "#D55E00", "D": "#CC79A7", "E": "#E69F00"}
# Fases do ciclo de período 5, sempre acompanhadas de legenda numerada.
COR_FASE = ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00"]
TINTA = "black"
CINZA = "#6B7280"
CINZA_CLARO = "#D7DBE0"
GRADE = "#E6E8EB"
TRANSIENTE = "#F1F2F4"
POCO_ESQ = "#DCE9F3"   # bacia do poço x = −1
POCO_DIR = "#F8E3D3"   # bacia do poço x = +1
LARGURA = 6.3  # polegadas = 16 cm, largura do texto no PDF


def rampa(cor: str, inicio: float = 0.18) -> LinearSegmentedColormap:
    """Rampa sequencial de um só matiz, do claro ao escuro, para codificar o tempo."""
    r, g, b = to_rgb(cor)
    claro = tuple(1 - inicio * 1.2 * (1 - c) for c in (r, g, b))
    escuro = tuple(0.72 * c for c in (r, g, b))
    return LinearSegmentedColormap.from_list("tempo", [claro, (r, g, b), escuro])


def registrar_times() -> None:
    """Disponibiliza ao matplotlib a Times New Roman do ambiente (pacote mscorefonts)."""
    for arquivo in (Path(sys.prefix) / "fonts").glob("times*.ttf"):
        font_manager.fontManager.addfont(arquivo)


def aplicar_estilo() -> None:
    registrar_times()
    mpl.rcParams.update({
        "font.family": ["Times New Roman", "STIXGeneral"],
        "mathtext.fontset": "custom",
        "mathtext.rm": "Times New Roman",
        "mathtext.it": "Times New Roman:italic",
        "mathtext.bf": "Times New Roman:bold",
        "mathtext.cal": "Times New Roman:italic",
        "mathtext.sf": "Times New Roman",
        "mathtext.tt": "DejaVu Sans Mono",
        "mathtext.fallback": "stix",
        "font.size": 9,
        "axes.titlesize": 9.5,
        "axes.titleweight": "normal",
        "axes.titlelocation": "center",
        "axes.labelsize": 9,
        "axes.edgecolor": "black",
        "axes.labelcolor": "black",
        "axes.titlecolor": "black",
        "axes.linewidth": 0.7,
        "axes.spines.top": True,
        "axes.spines.right": True,
        "axes.grid": False,
        "axes.axisbelow": True,
        "grid.color": GRADE,
        "grid.linewidth": 0.5,
        "xtick.color": "black",
        "ytick.color": "black",
        "xtick.labelcolor": "black",
        "ytick.labelcolor": "black",
        "xtick.major.width": 0.5,
        "ytick.major.width": 0.5,
        "xtick.major.size": 2.5,
        "ytick.major.size": 2.5,
        "xtick.direction": "in",
        "ytick.direction": "in",
        "legend.frameon": False,
        "legend.fontsize": 8,
        "lines.linewidth": 0.9,
        "axes.unicode_minus": True,
        "pdf.fonttype": 42,
        "savefig.dpi": 400,
        "figure.dpi": 100,
    })


def _texto_virgula(x: float, _pos=None) -> str:
    texto = f"{x:.10g}"
    return texto.replace(".", ",").replace("-", "−")


def virgula(ax, eixos: str = "xy") -> None:
    """Rótulos de eixo com vírgula decimal e sinal de menos tipográfico."""
    fmt = FuncFormatter(_texto_virgula)
    if "x" in eixos:
        ax.xaxis.set_major_formatter(fmt)
    if "y" in eixos:
        ax.yaxis.set_major_formatter(fmt)
