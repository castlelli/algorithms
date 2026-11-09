"""Linha de comando. Recebe os dados a-g do enunciado e gera os três gráficos pedidos."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

from .casos import CASOS
from .modelo import ErroDivergencia, ErroEntrada, Parametros, integrar

RAIZ = Path(__file__).resolve().parent.parent


def executar(p: Parametros, x0: float, v0: float, tmax: float, h: float | None, destino: Path) -> None:
    """Integra um conjunto de dados, grava a tabela x(t), v(t) e os gráficos, e imprime um resumo."""
    from .figuras import graficos_do_enunciado

    tr = integrar(p, x0, v0, tmax, h=h)
    destino.mkdir(parents=True, exist_ok=True)
    np.savetxt(destino / "trajetoria.csv", np.column_stack([tr.t, tr.x, tr.v]), delimiter=",",
               header="t_s,x_m,v_m_s", comments="", fmt="%.10g")
    arquivos = graficos_do_enunciado(p, tr, destino)
    d, a, b, g, w = p.coef
    print(f"delta = {d:.6g}   alpha = {a:.6g}   beta = {b:.6g}   gamma = {g:.6g}   omega = {w:.6g}")
    print(f"h = {tr.h:.6g} s   passos = {tr.t.size - 1}")
    print(f"x(t_max) = {tr.x[-1]:.8g} m   v(t_max) = {tr.v[-1]:.8g} m/s")
    print("arquivos: " + ", ".join(str(f.relative_to(RAIZ) if f.is_relative_to(RAIZ) else f) for f in arquivos))


def montar_argumentos() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="python -m codigo", description="Oscilador de Duffing por RK4.")
    ap.add_argument("--caso", choices=sorted(CASOS), help="conjunto de dados pronto")
    ap.add_argument("--todos", action="store_true", help="roda os 4 casos, as análises e gera o relatório")
    ap.add_argument("--relatorio", action="store_true", help="só refaz figuras e PDF (usa o cache)")
    ap.add_argument("--site", action="store_true", help="exporta os dados do site interativo (usa o cache)")
    for nome, ajuda in (("m", "massa do bloco [kg]"), ("k1", "constante linear da mola [N/m]"),
                        ("k2", "constante cúbica da mola [N/m³]"), ("c", "amortecimento viscoso [N·s/m]"),
                        ("A", "amplitude da força [N]"), ("omega", "frequência da força [rad/s]"),
                        ("tmax", "tempo máximo de observação [s]"), ("x0", "x(0) [m]"), ("v0", "ẋ(0) [m/s]")):
        ap.add_argument(f"--{nome}", type=float, help=ajuda)
    ap.add_argument("--h", type=float, help="passo de integração [s] (padrão: T/200 ou menor, se a mola exigir)")
    ap.add_argument("--saida", type=Path, help="pasta de saída (padrão: resultado/execucao)")
    return ap


def main(argv: list[str] | None = None) -> int:
    ap = montar_argumentos()
    a = ap.parse_args(argv)
    try:
        if a.site:
            from .site import export_site

            print(f"dados do site gravados em {export_site() / 'data'}")
            return 0
        if a.todos or a.relatorio:
            from .relatorio import gerar_relatorio

            if a.todos:
                for chave, caso in CASOS.items():
                    print(f"--- caso {chave}")
                    for i, (x0, v0) in enumerate(caso.condicoes):
                        sufixo = "" if len(caso.condicoes) == 1 else f"_{i + 1}"
                        executar(caso.p, x0, v0, caso.tmax, None, RAIZ / "resultado" / f"caso_{chave}{sufixo}")
            gerar_relatorio(RAIZ / "resultado" / "relatorio_duffing.pdf")
            return 0
        if a.caso:
            caso = CASOS[a.caso]
            for i, (x0, v0) in enumerate(caso.condicoes):
                sufixo = "" if len(caso.condicoes) == 1 else f"_{i + 1}"
                executar(caso.p, x0, v0, caso.tmax, a.h, a.saida or RAIZ / "resultado" / f"caso_{a.caso}{sufixo}")
            return 0
        faltando = [n for n in ("m", "k1", "k2", "c", "A", "omega", "tmax", "x0", "v0") if getattr(a, n) is None]
        if faltando:
            ap.error("faltam os dados: " + ", ".join(f"--{n}" for n in faltando))
        p = Parametros(a.m, a.k1, a.k2, a.c, a.A, a.omega)
        executar(p, a.x0, a.v0, a.tmax, a.h, a.saida or RAIZ / "resultado" / "execucao")
        return 0
    except (ErroEntrada, ErroDivergencia) as erro:
        print(f"erro: {erro}", file=sys.stderr)
        return 2
