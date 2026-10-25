"""Identidade visual comum à animação e às figuras do relatório."""

from __future__ import annotations

import matplotlib as mpl
from matplotlib.ticker import ScalarFormatter

# Okabe–Ito (seguro para daltônicos). O amarelo (#F0E442) ficou de fora por sumir no
# fundo claro; velocidades em azuis/verde e acelerações em quentes/preto, para o grupo
# ser reconhecido pela cor antes mesmo da legenda.
CORES: dict[str, str] = {
    "v_rel": "#56B4E9",  # azul-céu
    "v_arr": "#009E73",  # verde-azulado
    "v_abs": "#0072B2",  # azul
    "a_rel": "#E69F00",  # laranja
    "a_arr": "#CC79A7",  # púrpura-avermelhado
    "a_cor": "#D55E00",  # vermelhão
    "a_abs": "#000000",  # preto
}

ROTULOS: dict[str, str] = {
    "v_rel": r"$\mathbf{v}_{\mathrm{rel}}$",
    "v_arr": r"$\mathbf{v}_{\mathrm{arr}}$",
    "v_abs": r"$\mathbf{v}_{\mathrm{abs}}$",
    "a_rel": r"$\mathbf{a}_{\mathrm{rel}}$",
    "a_arr": r"$\mathbf{a}_{\mathrm{arr}}$",
    "a_cor": r"$\mathbf{a}_{\mathrm{cor}}$",
    "a_abs": r"$\mathbf{a}_{\mathrm{abs}}$",
}

NOMES: dict[str, str] = {
    "v_rel": "relativa", "v_arr": "de arrastamento", "v_abs": "absoluta",
    "a_rel": "relativa", "a_arr": "de arrastamento", "a_cor": "de Coriolis", "a_abs": "absoluta",
}

# Tons neutros do carrossel e do texto (não competem com as 7 cores dos vetores).
TINTA = "#1F2328"
CINZA = "#6B7280"
CINZA_CLARO = "#D7DBE0"
DISCO = "#F6F4EF"
SETOR = "#E9DFC7"
FUNDO_VEL = "#E3F0FA"
FUNDO_ACC = "#FBEBDD"


def aplicar_estilo() -> None:
    """Fonte STIX (casa com o STIX Two do PDF) e eixos discretos."""
    mpl.rcParams.update({
        "font.family": "STIXGeneral",
        "mathtext.fontset": "stix",
        "font.size": 9.5,
        "axes.titlesize": 10,
        "axes.labelsize": 9.5,
        "axes.edgecolor": CINZA,
        "axes.labelcolor": TINTA,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.grid": True,
        "grid.color": "#E6E8EB",
        "grid.linewidth": 0.6,
        "xtick.color": CINZA,
        "ytick.color": CINZA,
        "xtick.labelcolor": TINTA,
        "ytick.labelcolor": TINTA,
        "legend.frameon": False,
        "axes.unicode_minus": True,
        "savefig.bbox": "standard",
        "figure.dpi": 100,
    })


class FormatadorVirgula(ScalarFormatter):
    """Rótulos de eixo com vírgula decimal."""

    def __call__(self, x: float, pos: int | None = None) -> str:
        return super().__call__(x, pos).replace(".", ",")


def virgula(ax) -> None:  # noqa: ANN001 (Axes)
    for eixo in (ax.xaxis, ax.yaxis):
        if eixo.get_scale() == "linear":
            fmt = FormatadorVirgula(useMathText=False)
            fmt.set_useOffset(False)
            eixo.set_major_formatter(fmt)
