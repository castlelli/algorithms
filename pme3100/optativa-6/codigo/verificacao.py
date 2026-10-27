"""Verificações numéricas da cinemática (seção 5 do plano), usadas pelo pytest e pelo PDF.

A peça central é a comparação com a derivada numérica: derivar a posição absoluta
e reencontrar v_abs, e derivar v_abs e reencontrar a_abs. Esse teste não usa as
fórmulas de composição, então só passa se arrastamento e Coriolis estiverem certos.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import numpy as np

from .modelo import Movimento

TOL_COMPOSICAO = 1e-9
TOL_DERIVADA = 1e-5
TOL_ANALITICO = 1e-9


@dataclass(frozen=True)
class Checagem:
    chave: str
    descricao: str     # LaTeX (vai direto para a tabela do relatório)
    valor: float       # grandeza medida (erro, resíduo...)
    tolerancia: float
    aprovado: bool


def derivada_numerica(f: Callable[[np.ndarray], np.ndarray], tt: np.ndarray, h: float) -> np.ndarray:
    """Diferença central de 5 pontos, O(h⁴): com h = 1e-3 s, truncamento ~1e-12."""
    tt = np.asarray(tt, dtype=float)
    cols = [f(tt + k * h) for k in (-2, -1, 1, 2)]
    return (cols[0] - 8 * cols[1] + 8 * cols[2] - cols[3]) / (12 * h)


def grade_interior(mov: Movimento, n: int = 600, h: float = 1e-3) -> np.ndarray:
    """Instantes em [2h, t_f − 2h]: o estêncil não sai do intervalo do movimento."""
    return np.linspace(2 * h, mov.t_f - 2 * h, n)


def erros_derivada(mov: Movimento, n: int = 600, h: float = 1e-3) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(t, erro relativo de v_abs, erro relativo de a_abs) ao longo do movimento.

    Erro relativo = ‖derivada numérica − analítica‖ / máx_t ‖analítica‖; normaliza-se
    pelo máximo para não dividir por zero onde o vetor se anula. Se o vetor é
    identicamente nulo (ex.: ω = 0 e v constante ⇒ a_abs ≡ 0), usa-se o erro absoluto.
    """
    tt = grade_interior(mov, n, h)
    e = mov.estado(tt)
    v_abs, a_abs = e.cartesiano("v_abs"), e.cartesiano("a_abs")
    v_num = derivada_numerica(lambda s: mov.estado(s).posicao, tt, h)
    a_num = derivada_numerica(lambda s: mov.estado(s).cartesiano("v_abs"), tt, h)
    ref_v, ref_a = (float(np.linalg.norm(x, axis=-1).max()) for x in (v_abs, a_abs))
    ref_v, ref_a = (x if x > 1e-12 else 1.0 for x in (ref_v, ref_a))
    return (tt, np.linalg.norm(v_num - v_abs, axis=-1) / ref_v,
            np.linalg.norm(a_num - a_abs, axis=-1) / ref_a)


def _chk(chave: str, descricao: str, valor: float, tol: float) -> Checagem:
    return Checagem(chave, descricao, float(valor), tol, bool(abs(valor) <= tol))


def verificar(mov: Movimento) -> list[Checagem]:
    """Todas as checagens aplicáveis a este movimento."""
    tt = np.linspace(0.0, mov.t_f, 2001)
    e = mov.estado(tt)
    v_dir, a_dir = mov.derivadas_diretas(tt)
    soma_v = e.cartesiano("v_rel") + e.cartesiano("v_arr")
    soma_a = e.cartesiano("a_rel") + e.cartesiano("a_arr") + e.cartesiano("a_cor")
    _, err_v, err_a = erros_derivada(mov)
    fonte = "de $x(t),\\,y(t)$" if mov.simbolico else "pela regra da cadeia"

    out = [
        _chk("composicao_v",
             r"$\max_t \lVert \mathbf{v}_{\mathrm{rel}}+\mathbf{v}_{\mathrm{arr}}"
             rf" - \dot{{\mathbf{{r}}}}_F\rVert$, com $\dot{{\mathbf{{r}}}}_F$ derivada analítica {fonte}",
             np.abs(soma_v - v_dir).max(), TOL_COMPOSICAO),
        _chk("composicao_a",
             r"$\max_t \lVert \mathbf{a}_{\mathrm{rel}}+\mathbf{a}_{\mathrm{arr}}+\mathbf{a}_{\mathrm{cor}}"
             rf" - \ddot{{\mathbf{{r}}}}_F\rVert$, derivada analítica {fonte}",
             np.abs(soma_a - a_dir).max(), TOL_COMPOSICAO),
        _chk("derivada_v",
             r"erro relativo máx. entre $\mathrm{d}\vb{OF}/\mathrm{d}t$ numérica e $\mathbf{v}_{\mathrm{abs}}$",
             err_v.max(), TOL_DERIVADA),
        _chk("derivada_a",
             r"erro relativo máx. entre $\mathrm{d}\mathbf{v}_{\mathrm{abs}}/\mathrm{d}t$ numérica e "
             r"$\mathbf{a}_{\mathrm{abs}}$",
             err_a.max(), TOL_DERIVADA),
        _chk("v_nao_negativa", r"$\min\{0,\ \min_t v(t)\}$ (v é módulo: não pode ser negativa)",
             min(0.0, float(e.v.min())), 1e-12),
    ]
    if mov.chegou:
        out.append(_chk("t_f", r"$|r(t_f)|$ no instante de chegada ao centro",
                        float(mov.r(mov.t_f)), TOL_ANALITICO))

    if mov.omega_expr.is_constant() and mov.v_expr.is_constant():
        w, v = float(mov.omega_expr), float(mov.v_expr)
        out += [
            _chk("const_cor", r"$\max_t \bigl|\,|\mathbf{a}_{\mathrm{cor}}| - 2|\omega| v\,\bigr|$",
                 np.abs(e.modulo("a_cor") - 2 * abs(w) * v).max(), TOL_ANALITICO),
            _chk("const_arr", r"$\max_t \lVert \mathbf{a}_{\mathrm{arr}} + \omega^2 r\,\mathbf{e}_r\rVert$",
                 np.abs(e.a_arr - np.stack([-w**2 * e.r, 0 * e.r], -1)).max(), TOL_ANALITICO),
            _chk("const_rel", r"$\max_t \lVert \mathbf{a}_{\mathrm{rel}}\rVert$",
                 np.abs(e.a_rel).max(), TOL_ANALITICO),
        ]
        if v > 0:
            out.append(_chk("const_tf", r"$|t_f - R/v|$", mov.t_f - mov.R / v, TOL_ANALITICO))

    if mov.omega_expr == 0:
        for nome in ("v_arr", "a_arr", "a_cor"):
            out.append(_chk(f"omega0_{nome}", rf"$\omega\equiv 0$: $\max_t\lVert\mathbf{{{nome[0]}}}"
                            rf"_{{\mathrm{{{nome[2:]}}}}}\rVert$", np.abs(e.polar(nome)).max(),
                            TOL_ANALITICO))
    return out
