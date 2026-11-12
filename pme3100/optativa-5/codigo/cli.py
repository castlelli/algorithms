"""Linha de comando: ``python -m codigo`` (relatório, GIF e MP4), ``--so-tabela`` ou ``--site``."""

from __future__ import annotations

import argparse
import math
import sys
import time
from pathlib import Path

import numpy as np

from .casos import PADRAO, Entradas
from .formatacao import limpar, num
from .modelo import CurvaEspacial, ErroEntrada, Hipocicloide, instante

ROOT = Path(__file__).resolve().parent.parent


def _numero(texto: str) -> float:
    """Aceita "5", "3.5", "3,5" e expressões simples com pi ("pi/60")."""
    t = texto.strip().replace(",", ".")
    try:
        return float(t)
    except ValueError:
        pass
    if not all(c in "0123456789.+-*/() pi" for c in t):
        raise argparse.ArgumentTypeError(f"número inválido: {texto!r}")
    try:
        return float(eval(t, {"__builtins__": {}}, {"pi": math.pi}))  # noqa: S307 (só dígitos, operadores e pi)
    except Exception as erro:  # noqa: BLE001
        raise argparse.ArgumentTypeError(f"número inválido: {texto!r}") from erro


def _lista(texto: str) -> tuple[float, ...]:
    partes = [p for p in texto.replace(";", " ").split() if p]
    if not partes:
        raise argparse.ArgumentTypeError("lista vazia")
    return tuple(_numero(p) for p in partes)


def tabelas(e: Entradas) -> str:
    """Itens 1.5, 1.7 e 2.2 como texto, para o terminal."""
    h = Hipocicloide(e.R, e.r)
    out = [f"Hipocicloide R = {num(e.R)}, r = {num(e.r)}: R/r = {h.p}/{h.q}, {h.p} bicos, "
           f"fecha em θ = 2π·{h.q}, comprimento {num(h.comprimento)}" if h.fecha else
           f"Hipocicloide R = {num(e.R)}, r = {num(e.r)}: R/r irracional, a curva não fecha"]
    if h.fecha:
        out.append("\n1.5  raio de curvatura")
        out.append(f"{'θ [rad]':>10} {'x':>10} {'y':>10} {'ρ':>10}")
        for t in h.pontos_seguros(e.pontos_rho):
            P = h.posicao(t)
            out.append(f"{num(t):>10} {num(limpar(P[0], e.R)):>10} {num(limpar(P[1], e.R)):>10} {num(float(h.rho_fechado(t))):>10}")
    out.append(f"\n1.7  θ = ωt, ω = {num(e.omega)} rad/s")
    out.append(f"{'t [s]':>7} {'v_x':>10} {'v_y':>10} {'a_x':>10} {'a_y':>10} │ {'ṡ':>10} {'a_t':>10} {'a_n':>10} {'ρ':>8}")
    for t in e.instantes:
        i = instante(h, e.omega, t)
        out.append(f"{num(t):>7} {num(i.v[0]):>10} {num(i.v[1]):>10} {num(i.a[0]):>10} {num(i.a[1]):>10} │ "
                   f"{num(i.rapidez):>10} {num(i.a_t):>10} {num(i.a_n):>10} {num(i.rho):>8}")
    out.append("\n2.2/2.3  cúbica reversa r(λ) = (λ, λ², λ³)")
    for lam in e.lambdas:
        f = CurvaEspacial.frenet(lam)
        v = lambda x: "(" + ", ".join(num(c) for c in x) + ")"  # noqa: E731
        out.append(f"λ = {num(lam)}: ρ = {num(f.rho)}, torção = {num(f.torcao)}, τ = {v(f.tau)}, "
                   f"n = {v(f.n)}, b = {v(f.b)}")
    return "\n".join(out)


def _argumentos() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        prog="python -m codigo",
        description="Tarefa 5: hipocicloide (curvatura, versores, velocidade e aceleração) "
                    "e triedro de Frenet da cúbica reversa. Gera relatório em PDF, GIF e MP4.",
        epilog='Ex.: python -m codigo --R 7 --r 2 --razoes "3 4 5 3.5" --lambdas "-1 0.5 1"',
    )
    d = PADRAO
    ap.add_argument("--R", type=_numero, default=d.R, help=f"raio do aro (padrão {d.R:g})")
    ap.add_argument("--r", type=_numero, default=d.r, help=f"raio do disco (padrão {d.r:g})")
    ap.add_argument("--razoes", type=_lista, default=d.razoes, help="razões R/r do item 1.4 (padrão \"3 4 5 3.5\")")
    ap.add_argument("--omega", type=_numero, default=d.omega, help='ω [rad/s] da lei θ = ωt (padrão "pi/60")')
    ap.add_argument("--instantes", type=_lista, default=d.instantes, help="instantes do item 1.7 [s] (padrão \"10 30 50\")")
    ap.add_argument("--lambdas", type=_lista, default=d.lambdas, help="pontos λ da parte 2 (padrão \"-1 0.5 1\")")
    ap.add_argument("--saida", type=Path, default=ROOT / "resultado", help="pasta dos resultados (padrão resultado/)")
    ap.add_argument("--sem-video", action="store_true", help="não grava GIF/MP4")
    ap.add_argument("--so-tabela", action="store_true", help="só imprime as tabelas no terminal")
    ap.add_argument("--site", action="store_true",
                    help="exporta os números dos dados padrão para o site (docs/hypocycloid/data)")
    return ap


def _validar(e: Entradas) -> None:
    h = Hipocicloide(e.R, e.r)
    if not h.fecha:
        raise ErroEntrada("R/r precisa ser racional (p/q com q ≤ 1000) para a curva fechar.")
    if h.degenerada:
        raise ErroEntrada("Com R = 2r a hipocicloide é um segmento de reta: ρ é infinito e n não existe.")
    for k in e.razoes:
        Hipocicloide(k, 1.0)
    for lam in e.lambdas:
        if lam == 0:
            raise ErroEntrada("O enunciado pede λ ≠ 0.")
    for t in e.instantes:
        instante(h, e.omega, t)


def main(argv: list[str] | None = None) -> int:
    a = _argumentos().parse_args(argv)
    if a.site:
        from .site import export_site
        print(f"site: {export_site()}")
        return 0
    e = Entradas(R=a.R, r=a.r, razoes=a.razoes, omega=a.omega, instantes=a.instantes, lambdas=a.lambdas)
    try:
        _validar(e)
    except ErroEntrada as erro:
        print(f"erro: {erro}", file=sys.stderr)
        return 2
    print(tabelas(e))
    if a.so_tabela:
        return 0

    from .relatorio import gerar
    from .verificacao import verificar
    falhas = [c.chave for c in verificar(e) if not c.aprovado]
    if falhas:
        print(f"aviso: verificações reprovadas: {', '.join(falhas)}", file=sys.stderr)
    saida: Path = a.saida
    saida.mkdir(parents=True, exist_ok=True)
    inicio = time.perf_counter()
    avisos = gerar(e, saida / "relatorio.pdf", saida.parent / "build")
    for aviso in avisos:
        print(f"LaTeX: {aviso}", file=sys.stderr)
    print(f"PDF: {saida / 'relatorio.pdf'}")
    if not a.sem_video:
        from .animacao import gravar
        gravar(Hipocicloide(e.R, e.r), saida / "hipocicloide.gif", saida / "hipocicloide.mp4")
        print(f"GIF: {saida / 'hipocicloide.gif'}\nMP4: {saida / 'hipocicloide.mp4'}")
    print(f"pronto em {time.perf_counter() - inicio:.1f} s")
    return 0
