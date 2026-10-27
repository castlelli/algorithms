"""Física do problema do carrossel e da formiga.

Lei de movimento, velocidades (relativa, de arrastamento, absoluta) e acelerações
(relativa, de arrastamento, de Coriolis, absoluta) da formiga F que anda sobre uma
reta radial fixa no carrossel, rumo ao centro O.

Este módulo não importa matplotlib: só sympy (forma exata e LaTeX) e numpy/scipy
(avaliação numérica). A apresentação fica em ``animacao.py`` e ``relatorio.py``.
"""

from __future__ import annotations

import io
import signal
import threading
import tokenize
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Callable, Iterator

import numpy as np
import sympy as sp
from scipy.integrate import solve_ivp
from scipy.optimize import brentq
from sympy.parsing.sympy_parser import (
    convert_xor,
    parse_expr,
    rationalize,
    standard_transformations,
)

# t ≥ 0 e real: ajuda o sympy a simplificar integrais e derivadas.
t = sp.Symbol("t", real=True, nonnegative=True)
_tau = sp.Symbol("tau", real=True, nonnegative=True)

FUNCOES_PERMITIDAS: dict[str, sp.Basic] = {
    "sin": sp.sin, "sen": sp.sin, "cos": sp.cos, "tan": sp.tan, "tg": sp.tan,
    "asin": sp.asin, "acos": sp.acos, "atan": sp.atan,
    "sinh": sp.sinh, "cosh": sp.cosh, "tanh": sp.tanh,
    "exp": sp.exp, "log": sp.log, "ln": sp.log, "sqrt": sp.sqrt,
    "abs": sp.Abs, "Abs": sp.Abs,
}
CONSTANTES: dict[str, sp.Basic] = {"pi": sp.pi, "E": sp.E}
_OPERADORES = {"+", "-", "*", "/", "**", "^", "(", ")"}
_TOKENS_NEUTROS = {tokenize.NEWLINE, tokenize.NL, tokenize.ENDMARKER, tokenize.INDENT,
                   tokenize.DEDENT}

# Limite de tempo para sympy.integrate: certas expressões fazem o sympy rodar
# indefinidamente. Estourado o limite, cai-se na integração numérica.
TEMPO_MAX_INTEGRAL_S = 8.0
# Tolerância para aceitar v(t) "≥ 0" (zeros numéricos como -1e-17).
_TOL_V_NEGATIVA = 1e-12
_PONTOS_VALIDACAO = 20_001


class ErroEntrada(ValueError):
    """Entrada inválida, com mensagem pronta para o usuário."""


# --------------------------------------------------------------------------- parse
def interpretar(texto: str, nome: str, permite_t: bool = True) -> sp.Expr:
    """Converte uma string em expressão sympy, aceitando só uma lista branca de nomes.

    Nada de ``eval`` direto: os tokens são conferidos um a um (nomes, números e
    operadores aritméticos) antes de o sympy montar a expressão.
    """
    rotulo = f"{nome}(t)" if permite_t else nome
    if not isinstance(texto, str) or not texto.strip():
        raise ErroEntrada(f"{rotulo}: expressão vazia.")
    permitidos = sorted(set(FUNCOES_PERMITIDAS) | set(CONSTANTES))
    try:
        tokens = list(tokenize.generate_tokens(io.StringIO(texto.strip()).readline))
    except (tokenize.TokenError, SyntaxError) as erro:
        raise ErroEntrada(f"{rotulo} = {texto!r}: expressão mal formada ({erro}).") from None
    for tok in tokens:
        if tok.type in _TOKENS_NEUTROS:
            continue
        if tok.type == tokenize.NAME:
            if tok.string == "t" and permite_t:
                continue
            if tok.string in FUNCOES_PERMITIDAS or tok.string in CONSTANTES:
                continue
            extra = "t, " if permite_t else ""
            raise ErroEntrada(
                f"{rotulo} = {texto!r}: nome {tok.string!r} não permitido. "
                f"Use {extra}números, + - * / ** ^ ( ) e: {', '.join(permitidos)}."
            )
        if tok.type == tokenize.NUMBER and "j" not in tok.string.lower():
            continue
        if tok.type == tokenize.OP and tok.string in _OPERADORES:
            continue
        raise ErroEntrada(f"{rotulo} = {texto!r}: trecho {tok.string!r} não permitido.")

    local = {"t": t, **FUNCOES_PERMITIDAS, **CONSTANTES}
    try:
        expr = parse_expr(
            texto,
            local_dict=local,
            # rationalize: 0.25 → 1/4, para que integrais e derivadas sejam exatas.
            transformations=standard_transformations + (convert_xor, rationalize),
        )
    except Exception as erro:  # sympy levanta tipos variados (SyntaxError, TypeError...)
        dica = " Multiplicação exige *, ex.: 2*t." if isinstance(erro, SyntaxError) else ""
        raise ErroEntrada(f"{rotulo} = {texto!r}: expressão inválida ({erro}).{dica}") from None
    if not isinstance(expr, sp.Expr) or expr.has(sp.zoo, sp.oo, sp.nan, sp.I):
        raise ErroEntrada(f"{rotulo} = {texto!r}: não é uma expressão real finita.")
    sobra = expr.free_symbols - {t}
    if sobra or (not permite_t and expr.free_symbols):
        raise ErroEntrada(f"{rotulo} = {texto!r}: variável inesperada {sobra or {t}}.")
    return expr


def _numero(valor: float | str, nome: str) -> sp.Expr:
    """R e φ₀ como números exatos (2.4 → 12/5; "pi/4" também vale)."""
    if isinstance(valor, str):
        return interpretar(valor, nome, permite_t=False)
    if not np.isfinite(valor):
        raise ErroEntrada(f"{nome} = {valor}: deve ser um número finito.")
    return sp.Rational(repr(float(valor)))


# ----------------------------------------------------------------------- utilidades
class _TempoEsgotado(Exception):
    pass


@contextmanager
def _limite_de_tempo(segundos: float) -> Iterator[None]:
    """SIGALRM só funciona na thread principal; fora dela, roda sem limite."""
    if threading.current_thread() is not threading.main_thread():
        yield
        return

    def _estourou(*_: object) -> None:
        raise _TempoEsgotado

    anterior = signal.signal(signal.SIGALRM, _estourou)
    signal.setitimer(signal.ITIMER_REAL, segundos)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, anterior)


def _integral_exata(expr: sp.Expr) -> sp.Expr | None:
    """∫₀ᵗ expr dτ em forma fechada, ou None se o sympy não conseguir."""
    try:
        with _limite_de_tempo(TEMPO_MAX_INTEGRAL_S):
            res = sp.integrate(expr.subs(t, _tau), (_tau, 0, t))
    except _TempoEsgotado:
        return None
    if res.has(sp.Integral):
        return None
    return sp.expand(res) if res.is_polynomial(t) else res


def _vetorizar(expr: sp.Expr) -> Callable[[np.ndarray], np.ndarray]:
    """lambdify que sempre devolve array do formato de t (inclusive para constantes)."""
    f = sp.lambdify(t, expr, modules=["numpy", "scipy"])

    def avaliar(tt: np.ndarray | float) -> np.ndarray:
        tt = np.asarray(tt, dtype=float)
        return np.asarray(f(tt), dtype=float) + np.zeros_like(tt)

    return avaliar


def _polar(er: np.ndarray, ephi: np.ndarray) -> np.ndarray:
    """Empilha componentes (e_r, e_φ) num array (..., 2)."""
    return np.stack(np.broadcast_arrays(er, ephi), axis=-1)


# ------------------------------------------------------------------------- entrada
@dataclass(frozen=True)
class Parametros:
    """Dados do problema. ω e v são strings em t (ex.: ``"0.5 + 0.1*t"``)."""

    R: float | str           # raio do carrossel [m]
    phi0: float | str        # ângulo inicial da reta da formiga [rad]
    omega: str               # ω(t) [rad/s]
    v: str                   # v(t) ≥ 0, módulo da velocidade relativa rumo ao centro [m/s]
    dt: float                # Δt de exibição dos vetores [s]
    t_instante: float | None = None  # "instante qualquer" de (b) e (c) [s]; None → t_f/2
    tmax: float = 60.0       # horizonte máximo se a formiga não chegar ao centro [s]


# Nomes dos vetores, na ordem em que aparecem em tabelas, legendas e animação.
VELOCIDADES = ("v_rel", "v_arr", "v_abs")
ACELERACOES = ("a_rel", "a_arr", "a_cor", "a_abs")
VETORES = VELOCIDADES + ACELERACOES


@dataclass(frozen=True)
class Estado:
    """Cinemática em um ou mais instantes. Vetores em componentes (e_r, e_φ), forma (..., 2)."""

    t: np.ndarray
    r: np.ndarray
    phi: np.ndarray
    omega: np.ndarray
    alpha: np.ndarray
    v: np.ndarray
    vdot: np.ndarray
    v_rel: np.ndarray
    v_arr: np.ndarray
    v_abs: np.ndarray
    a_rel: np.ndarray
    a_arr_t: np.ndarray   # parcela tangencial α ∧ OF
    a_arr_n: np.ndarray   # parcela centrípeta ω ∧ (ω ∧ OF)
    a_arr: np.ndarray
    a_cor: np.ndarray
    a_abs: np.ndarray

    def polar(self, nome: str) -> np.ndarray:
        return getattr(self, nome)

    def cartesiano(self, nome: str) -> np.ndarray:
        """Componentes (i, j) do vetor: e_r = (cos φ, sin φ), e_φ = (−sin φ, cos φ)."""
        vr, vphi = self.polar(nome)[..., 0], self.polar(nome)[..., 1]
        c, s = np.cos(self.phi), np.sin(self.phi)
        return _polar(vr * c - vphi * s, vr * s + vphi * c)

    def modulo(self, nome: str) -> np.ndarray:
        return np.linalg.norm(self.polar(nome), axis=-1)

    @property
    def posicao(self) -> np.ndarray:
        """OF em (i, j): x = r cos φ, y = r sin φ."""
        return _polar(self.r * np.cos(self.phi), self.r * np.sin(self.phi))


# ---------------------------------------------------------------------- movimento
class Movimento:
    """Resolve o problema para um conjunto de parâmetros.

    Atributos simbólicos (sympy): ``omega_expr``, ``v_expr``, ``alpha_expr``,
    ``vdot_expr``, ``r_expr`` e ``phi_expr`` (os dois últimos são None quando a
    integral não tem forma fechada e a lei foi obtida numericamente).
    """

    def __init__(self, p: Parametros) -> None:
        self.p = p
        self.R_expr = _numero(p.R, "R")
        self.phi0_expr = _numero(p.phi0, "φ₀")
        self.R = float(self.R_expr)
        self.phi0 = float(self.phi0_expr)
        if self.R <= 0:
            raise ErroEntrada(f"R = {p.R}: o raio do carrossel deve ser positivo.")
        if not (np.isfinite(p.dt) and p.dt > 0):
            raise ErroEntrada(f"Δt = {p.dt}: o intervalo de exibição deve ser positivo.")
        if not (np.isfinite(p.tmax) and p.tmax > 0):
            raise ErroEntrada(f"t_max = {p.tmax}: deve ser positivo.")
        self.dt = float(p.dt)
        self.tmax = float(p.tmax)

        self.omega_expr = interpretar(p.omega, "ω")
        self.v_expr = interpretar(p.v, "v")
        self.alpha_expr = sp.diff(self.omega_expr, t)
        self.vdot_expr = sp.diff(self.v_expr, t)
        self.omega = _vetorizar(self.omega_expr)
        self.v = _vetorizar(self.v_expr)
        self.alpha = _vetorizar(self.alpha_expr)
        self.vdot = _vetorizar(self.vdot_expr)
        self._conferir_finitas(np.linspace(0.0, self.tmax, _PONTOS_VALIDACAO),
                               {"ω": self.omega, "v": self.v})

        self._lei_de_movimento()
        self._achar_t_final()
        self._validar_no_intervalo()

        if p.t_instante is None:
            self.t_instante = 0.5 * self.t_f
        else:
            self.t_instante = float(p.t_instante)
            if not (0.0 <= self.t_instante <= self.t_f):
                raise ErroEntrada(
                    f"t = {p.t_instante} s fora do movimento: use 0 ≤ t ≤ t_f = {self.t_f:.4g} s."
                )

    # -- (a) lei de movimento --------------------------------------------------------
    def _lei_de_movimento(self) -> None:
        self.int_v = int_v = _integral_exata(self.v_expr)
        self.int_w = int_w = _integral_exata(self.omega_expr)
        self.r_expr = None if int_v is None else self.R_expr - int_v
        self.phi_expr = None if int_w is None else self.phi0_expr + int_w
        self.simbolico = self.r_expr is not None and self.phi_expr is not None

        if self.simbolico:
            self._r = _vetorizar(self.r_expr)
            self._phi = _vetorizar(self.phi_expr)
            amostra = np.linspace(0.0, self.tmax, 257)
            if np.all(np.isfinite(self._r(amostra))) and np.all(np.isfinite(self._phi(amostra))):
                return
            # Forma fechada com função especial que o numpy/scipy não avalia: numérico.
            self.r_expr = self.phi_expr = None
            self.simbolico = False

        # ṙ = −v, φ̇ = ω. DOP853 com dense_output dá um interpolante contínuo de alta
        # ordem, preciso o bastante para o teste de derivada numérica (erro < 1e-5).
        sol = solve_ivp(
            lambda tt, y: [-float(self.v(tt)), float(self.omega(tt))],
            (0.0, self.tmax), [self.R, self.phi0],
            method="DOP853", dense_output=True, rtol=1e-12, atol=1e-12,
        )
        if not sol.success:
            raise ErroEntrada(f"Falha na integração numérica de v e ω: {sol.message}")
        self._r = lambda tt: np.asarray(sol.sol(np.asarray(tt, dtype=float))[0])
        self._phi = lambda tt: np.asarray(sol.sol(np.asarray(tt, dtype=float))[1])

    def r(self, tt: np.ndarray | float) -> np.ndarray:
        return self._r(tt)

    def phi(self, tt: np.ndarray | float) -> np.ndarray:
        return self._phi(tt)

    def _achar_t_final(self) -> None:
        """t_f: primeira raiz de r(t) = 0 em [0, t_max] (brentq no 1º intervalo com troca de sinal)."""
        grade = np.linspace(0.0, self.tmax, _PONTOS_VALIDACAO)
        rr = self.r(grade)
        abaixo = np.nonzero(rr <= 0.0)[0]
        if abaixo.size == 0:
            self.t_f, self.chegou = self.tmax, False
            return
        i = abaixo[0]
        if rr[i] == 0.0:
            self.t_f = float(grade[i])
        else:
            self.t_f = float(brentq(lambda tt: float(self.r(tt)), grade[i - 1], grade[i],
                                    xtol=1e-14, rtol=1e-15, maxiter=200))
        self.chegou = True

    def _validar_no_intervalo(self) -> None:
        grade = np.linspace(0.0, self.t_f, _PONTOS_VALIDACAO)
        self._conferir_finitas(grade, {"α = dω/dt": self.alpha, "dv/dt": self.vdot})
        vv = self.v(grade)
        if np.any(vv < -_TOL_V_NEGATIVA):
            i = int(np.argmax(vv < -_TOL_V_NEGATIVA))
            raise ErroEntrada(
                f"v(t) = {self.p.v!r} fica negativa em t ≈ {grade[i]:.4g} s "
                f"(v = {vv[i]:.4g} m/s). v é o módulo da velocidade da formiga rumo ao "
                "centro e precisa ser ≥ 0 até ela chegar lá."
            )

    @staticmethod
    def _conferir_finitas(grade: np.ndarray, funcs: dict[str, Callable]) -> None:
        with np.errstate(all="ignore"):
            for nome, f in funcs.items():
                valores = f(grade)
                if not np.all(np.isfinite(valores)):
                    i = int(np.argmax(~np.isfinite(valores)))
                    raise ErroEntrada(
                        f"{nome} não é finita/real em t ≈ {grade[i]:.4g} s; "
                        "revise a expressão."
                    )

    # -- (b) e (c) -------------------------------------------------------------------
    def estado(self, tt: np.ndarray | float) -> Estado:
        """Velocidades e acelerações da seção 1 do modelo, em componentes (e_r, e_φ)."""
        tt = np.asarray(tt, dtype=float)
        r, phi = self.r(tt), self.phi(tt)
        w, a, v, vd = self.omega(tt), self.alpha(tt), self.v(tt), self.vdot(tt)
        zero = np.zeros_like(tt)

        v_rel = _polar(-v, zero)              # −v e_r
        v_arr = _polar(zero, w * r)           # ω ∧ OF = ω r e_φ
        a_rel = _polar(-vd, zero)             # −v̇ e_r
        a_arr_t = _polar(zero, a * r)         # α ∧ OF = α r e_φ
        a_arr_n = _polar(-w**2 * r, zero)     # ω ∧ (ω ∧ OF) = −ω² r e_r
        a_arr = a_arr_t + a_arr_n
        a_cor = _polar(zero, -2.0 * w * v)    # 2 ω ∧ v_rel = −2 ω v e_φ
        return Estado(
            t=tt, r=r, phi=phi, omega=w, alpha=a, v=v, vdot=vd,
            v_rel=v_rel, v_arr=v_arr, v_abs=v_rel + v_arr,
            a_rel=a_rel, a_arr_t=a_arr_t, a_arr_n=a_arr_n, a_arr=a_arr,
            a_cor=a_cor, a_abs=a_rel + a_arr + a_cor,
        )

    def derivadas_diretas(self, tt: np.ndarray | float) -> tuple[np.ndarray, np.ndarray]:
        """Velocidade e aceleração absolutas em (i, j) sem passar pela composição.

        Com lei simbólica, deriva-se x(t) = r cos φ e y(t) = r sin φ no sympy; sem ela,
        usa-se a regra da cadeia em coordenadas cartesianas. Serve de referência
        independente para o teste de composição.
        """
        tt = np.asarray(tt, dtype=float)
        if self.simbolico:
            if not hasattr(self, "_derivadas_xy"):
                x = self.r_expr * sp.cos(self.phi_expr)
                y = self.r_expr * sp.sin(self.phi_expr)
                self._derivadas_xy = [_vetorizar(sp.diff(e, t, n)) for n in (1, 2) for e in (x, y)]
            vx, vy, ax, ay = (f(tt) for f in self._derivadas_xy)
            return _polar(vx, vy), _polar(ax, ay)
        r, phi = self.r(tt), self.phi(tt)
        w, a, v, vd = self.omega(tt), self.alpha(tt), self.v(tt), self.vdot(tt)
        c, s = np.cos(phi), np.sin(phi)
        # ṙ = −v, r̈ = −v̇; ẋ = ṙc − rωs, ẍ = r̈c − 2ṙωs − rαs − rω²c (idem para y).
        vx, vy = -v * c - r * w * s, -v * s + r * w * c
        ax = -vd * c + 2 * v * w * s - r * a * s - r * w**2 * c
        ay = -vd * s - 2 * v * w * c + r * a * c - r * w**2 * s
        return _polar(vx, vy), _polar(ax, ay)

    def instantes_dt(self) -> np.ndarray:
        """Múltiplos de Δt em [0, t_f]."""
        k = int(np.floor(self.t_f / self.dt + 1e-9))
        return self.dt * np.arange(k + 1)

    # -- LaTeX ------------------------------------------------------------------------
    def latex(self) -> dict[str, str]:
        """Expressões em LaTeX para o relatório (vazio onde a forma fechada não existe)."""
        L = lambda e: sp.latex(sp.simplify(e))  # noqa: E731
        out = {
            "omega": sp.latex(self.omega_expr), "v": sp.latex(self.v_expr),
            "alpha": L(self.alpha_expr), "vdot": L(self.vdot_expr),
            "R": sp.latex(self.R_expr), "phi0": sp.latex(self.phi0_expr),
        }
        if self.simbolico:
            # Escreve r = R − (∫v) e φ = φ₀ + (∫ω) em vez da forma expandida do sympy,
            # para o leitor reconhecer cada parcela da dedução.
            def soma(base: sp.Expr, sinal: str, integral: sp.Expr) -> str:
                corpo = sp.latex(integral)
                if base == 0:
                    return corpo if sinal == "+" else sp.latex(-integral)
                if isinstance(integral, sp.Add) or sp.latex(integral).startswith("-"):
                    corpo = rf"\left({corpo}\right)"
                return f"{sp.latex(base)} {sinal} {corpo}"

            out["int_v"] = sp.latex(self.int_v)
            out["int_w"] = sp.latex(self.int_w)
            out["r"] = soma(self.R_expr, "-", self.int_v)
            out["phi"] = soma(self.phi0_expr, "+", self.int_w)
        return out


def grupo_no_instante(tt: float, dt: float) -> str:
    """Grupo de vetores exibido em t: ``"vel"`` se ⌊t/Δt⌋ é par, ``"acc"`` se é ímpar.

    O grupo trocado em kΔt permanece até (k+1)Δt. O 1e-9 evita que t = kΔt caia em
    k−1 por arredondamento (ex.: 3·0,1/0,1 = 2,9999…).
    """
    k = int(np.floor(tt / dt + 1e-9))
    return "vel" if k % 2 == 0 else "acc"
