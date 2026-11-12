"""Identidade visual comum às figuras, à animação e ao site (docs/hypocycloid usa as mesmas cores)."""

from __future__ import annotations

import matplotlib as mpl

mpl.use("Agg")

from matplotlib.ticker import ScalarFormatter  # noqa: E402

# Okabe–Ito para os versores (τ azul, n vermelhão, b verde: a ordem RGB de costume) e
# tons próprios para as grandezas cinemáticas, que nunca aparecem junto com b.
CORES: dict[str, str] = {
    "curva": "#1B3A6B",   # tinta de nanquim azul
    "aro": "#8A94A6",
    "disco": "#B4532A",
    "ponto": "#D1495B",
    "tau": "#0072B2",
    "n": "#D55E00",
    "b": "#009E73",
    "v": "#0E7C86",
    "a": "#B8336A",
    "a_t": "#E69F00",
    "a_n": "#CC79A7",
    "rho": "#7B5EA7",
}

TINTA = "#1F2328"
CINZA = "#6B7280"
CINZA_CLARO = "#D7DBE0"
PAPEL = "#F7F8FA"


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
