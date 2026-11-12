"""Exporta os números do relatório para o site interativo (docs/hypocycloid/data/report.json).

O site refaz toda a geometria no navegador (js/model.js repete modelo.py). Daqui saem só
as entradas, as tabelas dos itens 1.4, 1.5, 1.6, 1.7 e 2.2/2.3 e as checagens, que o site
recalcula e confere na seção "O navegador confere o relatório".
"""

from __future__ import annotations

import json
from pathlib import Path

from .casos import PADRAO, Entradas
from .estilo import CORES
from .modelo import CurvaEspacial, Hipocicloide, instante
from .verificacao import verificar

ROOT = Path(__file__).resolve().parent.parent
SITE_DIR = ROOT.parent.parent / "docs" / "hypocycloid"
URL_SITE = "https://castlelli.github.io/algorithms/hypocycloid/"


def _f(x: float) -> float:
    """Float com 15 algarismos: o JSON fica legível e a conferência no navegador vai a ~1e-12."""
    return float(f"{float(x):.15g}")


def _v(x) -> list[float]:  # noqa: ANN001
    return [_f(c) for c in x]


def dados_site(e: Entradas = PADRAO) -> dict:
    h = Hipocicloide(e.R, e.r)
    th15 = h.pontos_seguros(e.pontos_rho)
    th16 = h.pontos_seguros(e.pontos_versores)
    tau16, n16 = h.tangente_normal(th16)
    return {
        "url": URL_SITE,
        "cores": CORES,
        "entradas": {"R": e.R, "r": e.r, "razoes": list(e.razoes), "omega": _f(e.omega),
                     "instantes": list(e.instantes), "lambdas": list(e.lambdas)},
        "hipocicloide": {"p": h.p, "q": h.q, "theta_max": _f(h.theta_max), "arco_bico": _f(h.arco_bico),
                         "comprimento": _f(h.comprimento), "periodo": _f(h.theta_max / e.omega)},
        "razoes": [
            {"razao": k, "p": hk.p, "q": hk.q, "fecha": hk.fecha,
             "comprimento": _f(hk.comprimento) if hk.fecha else None}
            for k in e.razoes for hk in [Hipocicloide(k, 1.0)]
        ],
        "rho": [{"theta": _f(t), "posicao": _v(h.posicao(t)), "rho": _f(h.rho_fechado(t)),
                 "rho_geral": _f(h.rho(t))} for t in th15],
        "versores": [{"theta": _f(t), "posicao": _v(h.posicao(t)), "tau": _v(a), "n": _v(b)}
                     for t, a, b in zip(th16, tau16, n16)],
        "instantes": [
            {"t": i.t, "theta": _f(i.theta), "posicao": _v(i.posicao), "v": _v(i.v), "a": _v(i.a),
             "rapidez": _f(i.rapidez), "a_t": _f(i.a_t), "a_n": _f(i.a_n), "rho": _f(i.rho),
             "tau": _v(i.tau), "n": _v(i.n)}
            for i in (instante(h, e.omega, t) for t in e.instantes)
        ],
        "frenet": [
            {"lambda": f.lam, "posicao": _v(f.posicao), "tau": _v(f.tau), "n": _v(f.n), "b": _v(f.b),
             "curvatura": _f(f.curvatura), "rho": _f(f.rho), "torcao": _f(f.torcao)}
            for f in (CurvaEspacial.frenet(l) for l in e.lambdas)
        ],
        "checagens": [{"chave": c.chave, "descricao": c.descricao, "valor": _f(c.valor),
                       "tolerancia": c.tolerancia, "aprovado": c.aprovado} for c in verificar(e)],
    }


def export_site(alvo: Path | None = None, e: Entradas = PADRAO) -> Path:
    pasta = (alvo or SITE_DIR) / "data"
    pasta.mkdir(parents=True, exist_ok=True)
    arquivo = pasta / "report.json"
    arquivo.write_text(json.dumps(dados_site(e), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return arquivo
