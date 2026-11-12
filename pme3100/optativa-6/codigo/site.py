"""Exporta os números do relatório para o site interativo (docs/carousel/data/report.json).

O site refaz toda a cinemática no navegador; daqui saem só as leis em LaTeX (que o sympy
deduz e o navegador não) e os valores que o site confere: t_f, a tabela dos itens (b) e (c)
no instante pedido e as checagens da seção de verificação.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import sympy as sp

from .casos import CASOS
from .estilo import CORES
from .formatacao import latex_decimal
from .modelo import Movimento
from .verificacao import verificar

ROOT = Path(__file__).resolve().parent.parent
SITE_DIR = ROOT.parent.parent / "docs" / "carousel"
URL_SITE = "https://castlelli.github.io/algorithms/carousel/"

# Linhas da tabela dos itens (b) e (c), na ordem do relatório e da CLI.
LINHAS = ("v_rel", "v_arr", "v_abs", "a_rel", "a_arr", "a_arr_t", "a_arr_n", "a_cor", "a_abs")
PONTOS_SERIE = 41


def _f(x: float) -> float:
    """Float com 15 algarismos: o JSON fica legível e a conferência no navegador vai a ~1e-12."""
    return float(f"{float(x):.15g}")


def exportar_caso(numero: int) -> dict:
    caso = CASOS[numero]
    p = caso.p
    mov = Movimento(p)
    lx = mov.latex()
    latex = {
        "omega": latex_decimal(mov.omega_expr),
        "v": latex_decimal(mov.v_expr),
        "alpha": latex_decimal(sp.simplify(mov.alpha_expr)),
        "vdot": latex_decimal(sp.simplify(mov.vdot_expr)),
        "R": latex_decimal(mov.R_expr),
        "phi0": lx["phi0"],
    }
    if mov.simbolico:
        latex["r"] = lx["r"]
        latex["phi"] = lx["phi"]

    t0 = mov.t_instante
    e = mov.estado(np.array([t0]))
    tabela = {}
    for nome in LINHAS:
        pol, cart = e.polar(nome)[0], e.cartesiano(nome)[0]
        tabela[nome] = {"polar": [_f(pol[0]), _f(pol[1])], "cart": [_f(cart[0]), _f(cart[1])],
                        "mod": _f(np.linalg.norm(pol))}

    serie_t = np.linspace(0.0, mov.t_f, PONTOS_SERIE)
    return {
        "numero": numero,
        "titulo": caso.titulo,
        "rotulo": caso.rotulo,
        "params": {"omega": p.omega, "v": p.v, "R": str(p.R), "phi0": str(p.phi0), "dt": p.dt,
                   "t": t0},
        "t_f": _f(mov.t_f),
        "chegou": bool(mov.chegou),
        "simbolico": bool(mov.simbolico),
        "latex": latex,
        "escalares": {k: _f(getattr(e, k)[0]) for k in ("r", "phi", "omega", "alpha", "v", "vdot")},
        "tabela": tabela,
        "serie": {"t": [_f(x) for x in serie_t], "r": [_f(x) for x in mov.r(serie_t)],
                  "phi": [_f(x) for x in mov.phi(serie_t)]},
        "checagens": [{"chave": c.chave, "descricao": c.descricao, "valor": _f(c.valor),
                       "tolerancia": c.tolerancia, "aprovado": c.aprovado} for c in verificar(mov)],
    }


def dados_site() -> dict:
    return {"url": URL_SITE, "cores": CORES, "casos": [exportar_caso(n) for n in sorted(CASOS)]}


def export_site(alvo: Path | None = None) -> Path:
    pasta = (alvo or SITE_DIR) / "data"
    pasta.mkdir(parents=True, exist_ok=True)
    arquivo = pasta / "report.json"
    arquivo.write_text(json.dumps(dados_site(), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return arquivo
