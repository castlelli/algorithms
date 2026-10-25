"""Linha de comando: ``python -m carrossel --caso 1``, ``--todos`` ou funções próprias."""

from __future__ import annotations

import argparse
import dataclasses
import sys
import tempfile
import time
from pathlib import Path

import numpy as np

from .casos import CASOS, Caso
from .formatacao import num
from .modelo import ErroEntrada, Movimento, Parametros

_LINHAS = [
    ("v_rel", "v_rel", "m/s"), ("v_arr", "v_arr", "m/s"), ("v_abs", "v_abs", "m/s"),
    ("a_rel", "a_rel", "m/s²"), ("a_arr", "a_arr", "m/s²"),
    ("  α∧OF", "a_arr_t", "m/s²"), ("  ω∧(ω∧OF)", "a_arr_n", "m/s²"),
    ("a_cor", "a_cor", "m/s²"), ("a_abs", "a_abs", "m/s²"),
]


def tabela_instante(mov: Movimento, titulo: str) -> str:
    """Itens (b) e (c) no instante pedido, como tabela de texto."""
    e = mov.estado(np.array([mov.t_instante]))
    s = lambda x: num(float(x[0]), 4)  # noqa: E731
    cab = (f"{titulo} · t = {num(mov.t_instante, 4)} s   "
           f"(t_f = {num(mov.t_f, 4)} s{'' if mov.chegou else ', NÃO chega ao centro'})")
    esc = (f"r = {s(e.r)} m   φ = {s(e.phi)} rad   ω = {s(e.omega)} rad/s   "
           f"α = {s(e.alpha)} rad/s²   v = {s(e.v)} m/s   v̇ = {s(e.vdot)} m/s²")
    larg = [12, 11, 11, 11, 11, 11, 6]
    def linha(campos: list[str]) -> str:
        return "│" + "│".join(f" {c:<{w}}" if i == 0 else f"{c:>{w}} " for i, (c, w) in
                             enumerate(zip(campos, larg))) + "│"
    borda = lambda a, b, c: a + b.join("─" * (w + 1) for w in larg) + c  # noqa: E731
    out = [cab, esc, borda("┌", "┬", "┐"),
           linha(["vetor", "e_r", "e_φ", "i", "j", "módulo", "unid."]), borda("├", "┼", "┤")]
    for rotulo, nome, unid in _LINHAS:
        pol, cart = e.polar(nome)[0], e.cartesiano(nome)[0]
        out.append(linha([rotulo, num(pol[0]), num(pol[1]), num(cart[0]), num(cart[1]),
                          num(np.linalg.norm(pol)), unid]))
        if nome == "v_abs":
            out.append(borda("├", "┼", "┤"))
    out.append(borda("└", "┴", "┘"))
    return "\n".join(out)


def _argumentos() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        prog="python -m carrossel",
        description="Carrossel e formiga: lei de movimento, velocidades, acelerações, "
                    "animação e relatório em PDF.",
        epilog='Ex.: python -m carrossel --omega "0.5+0.2*t" --v "0.3" --R 2 --phi0 0 --dt 0.5 --t 1.7',
    )
    qual = ap.add_mutually_exclusive_group()
    qual.add_argument("--caso", type=int, choices=sorted(CASOS), help="caso pronto")
    qual.add_argument("--todos", action="store_true", help="roda os três casos prontos")
    ap.add_argument("--omega", help="ω(t) em rad/s, ex.: \"0.3*sin(t)\"")
    ap.add_argument("--v", help="v(t) ≥ 0 em m/s (módulo da velocidade rumo ao centro)")
    ap.add_argument("--R", type=float, default=2.0, help="raio do carrossel [m] (padrão 2)")
    ap.add_argument("--phi0", default="0", help="ângulo inicial da reta [rad]; aceita \"pi/4\"")
    ap.add_argument("--dt", type=float, help="Δt de exibição dos vetores [s] (obrigatório sem --caso)")
    ap.add_argument("--t", type=float, help="instante dos itens (b) e (c) [s] (padrão t_f/2)")
    ap.add_argument("--tmax", type=float, default=60.0, help="horizonte se não chegar ao centro [s]")
    ap.add_argument("--nome", default="personalizado", help="sufixo dos arquivos do caso próprio")
    ap.add_argument("--saida", type=Path, default=Path("saida"), help="pasta dos PDF/MP4/GIF")
    ap.add_argument("--build", type=Path, help="pasta de trabalho (LaTeX e quadros); padrão: temporária")
    ap.add_argument("--sem-video", action="store_true", help="não grava MP4/GIF (o PDF mantém a animação)")
    ap.add_argument("--so-tabela", action="store_true", help="só imprime a tabela do instante pedido")
    return ap


def _casos(a: argparse.Namespace, ap: argparse.ArgumentParser) -> list[Caso]:
    if a.todos or a.caso:
        escolhidos = list(CASOS.values()) if a.todos else [CASOS[a.caso]]
        trocas = {k: v for k, v in (("t_instante", a.t), ("dt", a.dt)) if v is not None}
        return [dataclasses.replace(c, p=dataclasses.replace(c.p, **trocas)) for c in escolhidos]
    faltam = [n for n in ("omega", "v", "dt") if getattr(a, n) is None]
    if faltam:
        ap.error("sem --caso/--todos, informe " + ", ".join(f"--{n}" for n in faltam))
    p = Parametros(R=a.R, phi0=a.phi0, omega=a.omega, v=a.v, dt=a.dt, t_instante=a.t, tmax=a.tmax)
    return [Caso(nome=a.nome, titulo="Caso personalizado", rotulo="ω(t) e v(t) do usuário",
                 descricao=r"Caso definido pelo usuário na linha de comando.", p=p)]


def main(argv: list[str] | None = None) -> int:
    ap = _argumentos()
    a = ap.parse_args(argv)
    casos = _casos(a, ap)
    movimentos = []
    for c in casos:
        try:
            movimentos.append(Movimento(c.p))
        except ErroEntrada as erro:
            print(f"erro ({c.titulo}): {erro}", file=sys.stderr)
            return 2

    falhou = False
    for c, mov in zip(casos, movimentos):
        print(tabela_instante(mov, f"{c.titulo}: {c.rotulo}"))
        if a.so_tabela:
            print()
            continue
        from .relatorio import gerar  # importa matplotlib/jinja só quando precisa

        inicio = time.time()
        with tempfile.TemporaryDirectory(prefix=f"carrossel-{c.nome}-") as tmp:
            build = (a.build / c.nome) if a.build else Path(tmp)
            res = gerar(mov, c.titulo, c.rotulo, c.descricao, c.nome, a.saida, build,
                        video=not a.sem_video)
        print(f"  → {res.pdf}" + (f", {res.mp4}, {res.gif}" if res.mp4 else "")
              + f"   ({time.time() - inicio:.0f} s)")
        if not mov.chegou:
            print(f"  aviso: a formiga não chega ao centro até t_max = {num(mov.tmax)} s.")
        if not res.checagens_ok:
            print("  ATENÇÃO: há verificações reprovadas (seção Verificação do PDF).")
            falhou = True
        for aviso in res.avisos_latex:
            print(f"  LaTeX: {aviso}")
        print()
    return 1 if falhou else 0
