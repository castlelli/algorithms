"""Geometria e cinemática da Tarefa 5: a hipocicloide (parte 1) e a cúbica reversa (parte 2).

Hipocicloide. Um disco de raio r rola sem escorregar por dentro de um aro de raio R > r.
θ é o ângulo do centro do disco, medido a partir de Ox. O ponto P do disco descreve

    x = (R − r) cos θ + r cos(kθ),   y = (R − r) sin θ − r sin(kθ),   k = (R − r)/r.

Com a = R − r (e portanto r·k = a), as derivadas em θ ficam

    x' = −a (sin θ + sin kθ),        y' =  a (cos θ − cos kθ),
    x'' = −a (cos θ + k cos kθ),     y'' = −a (sin θ − k sin kθ),

e saem duas formas fechadas, conferidas em ``verificacao.py``:

    |r'| = 2a |sin(Rθ/2r)|,          x'y'' − y'x'' = 2a²(1 − k) sin²(Rθ/2r),
    ρ = |r'|³ / |x'y'' − y'x''| = 4r(R − r)/|R − 2r| · |sin(Rθ/2r)|.

Nos bicos (sin(Rθ/2r) = 0) P toca o aro e para: |r'| = 0, e ρ → 0. Se R = 2r a curva é o
diâmetro do aro (um segmento de reta) e ρ = ∞. Por isso τ, n e ρ ficam indefinidos ali.

Cúbica reversa. r(λ) = (λ, λ², λ³), com o triedro de Frenet (τ, n, b), a curvatura e a torção.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from fractions import Fraction

import numpy as np

# Até que denominador procuramos p/q = R/r antes de declarar que a curva não fecha.
DENOMINADOR_MAX = 1000
TOL_RACIONAL = 1e-9


class ErroEntrada(ValueError):
    """Dado de entrada fora do domínio do problema (mensagem pronta para o usuário)."""


def razao_racional(razao: float) -> tuple[int, int] | None:
    """(p, q) primos entre si com p/q = razão, ou None se não houver com q ≤ DENOMINADOR_MAX."""
    f = Fraction(razao).limit_denominator(DENOMINADOR_MAX)
    if abs(f.numerator / f.denominator - razao) > TOL_RACIONAL * abs(razao):
        return None
    return f.numerator, f.denominator


@dataclass(frozen=True)
class Hipocicloide:
    R: float
    r: float
    p: int = field(init=False)
    q: int = field(init=False)
    fecha: bool = field(init=False)

    def __post_init__(self) -> None:
        R, r = float(self.R), float(self.r)
        if not (math.isfinite(R) and math.isfinite(r)) or r <= 0:
            raise ErroEntrada("r precisa ser um número positivo.")
        if R <= r:
            raise ErroEntrada("R precisa ser maior que r (o disco rola por dentro do aro).")
        object.__setattr__(self, "R", R)
        object.__setattr__(self, "r", r)
        pq = razao_racional(R / r)
        object.__setattr__(self, "fecha", pq is not None)
        p, q = pq if pq is not None else (0, 0)
        object.__setattr__(self, "p", p)
        object.__setattr__(self, "q", q)

    # ------------------------------------------------------------------ constantes
    @property
    def a(self) -> float:
        return self.R - self.r

    @property
    def k(self) -> float:
        return (self.R - self.r) / self.r

    @property
    def degenerada(self) -> bool:
        """R = 2r: P anda sobre um diâmetro do aro (par de Tusi)."""
        return abs(self.R - 2 * self.r) <= 1e-12 * self.R

    @property
    def theta_max(self) -> float:
        """Ângulo em que a curva fecha: 2πq (q voltas do centro do disco)."""
        if not self.fecha:
            raise ErroEntrada("R/r não é racional (q ≤ 1000): a curva nunca fecha.")
        return 2 * math.pi * self.q

    @property
    def n_bicos(self) -> int:
        """Bicos num período completo: p."""
        return self.p

    @property
    def arco_bico(self) -> float:
        """Comprimento de um arco entre dois bicos: 8r(R − r)/R."""
        return 8 * self.r * self.a / self.R

    @property
    def comprimento(self) -> float:
        """Comprimento total da curva fechada: p arcos."""
        return self.p * self.arco_bico

    def bicos(self, theta_max: float | None = None) -> np.ndarray:
        """Ângulos θ dos bicos em [0, theta_max]: θ_m = 2πm r/R."""
        tm = self.theta_max if theta_max is None else theta_max
        passo = 2 * math.pi * self.r / self.R
        return passo * np.arange(int(math.floor(tm / passo + 1e-9)) + 1)

    # ------------------------------------------------------------------- geometria
    def posicao(self, theta) -> np.ndarray:  # noqa: ANN001
        th = np.asarray(theta, dtype=float)
        k, a, r = self.k, self.a, self.r
        return np.stack([a * np.cos(th) + r * np.cos(k * th), a * np.sin(th) - r * np.sin(k * th)], axis=-1)

    def d1(self, theta) -> np.ndarray:  # noqa: ANN001
        th = np.asarray(theta, dtype=float)
        k, a = self.k, self.a
        return np.stack([-a * (np.sin(th) + np.sin(k * th)), a * (np.cos(th) - np.cos(k * th))], axis=-1)

    def d2(self, theta) -> np.ndarray:  # noqa: ANN001
        th = np.asarray(theta, dtype=float)
        k, a = self.k, self.a
        return np.stack([-a * (np.cos(th) + k * np.cos(k * th)), -a * (np.sin(th) - k * np.sin(k * th))], axis=-1)

    def centro_disco(self, theta) -> np.ndarray:  # noqa: ANN001
        th = np.asarray(theta, dtype=float)
        return self.a * np.stack([np.cos(th), np.sin(th)], axis=-1)

    def contato(self, theta) -> np.ndarray:  # noqa: ANN001
        """Ponto de contato disco–aro: o centro instantâneo de rotação do disco."""
        th = np.asarray(theta, dtype=float)
        return self.R * np.stack([np.cos(th), np.sin(th)], axis=-1)

    def seno_meio(self, theta) -> np.ndarray:  # noqa: ANN001
        """sin(Rθ/2r): zera nos bicos."""
        return np.sin(self.R * np.asarray(theta, dtype=float) / (2 * self.r))

    def cruzado(self, theta) -> np.ndarray:  # noqa: ANN001
        """x'y'' − y'x'' pela definição."""
        v, w = self.d1(theta), self.d2(theta)
        return v[..., 0] * w[..., 1] - v[..., 1] * w[..., 0]

    def rho(self, theta) -> np.ndarray:  # noqa: ANN001
        """Raio de curvatura pela fórmula geral |r'|³/|x'y'' − y'x''| (inf se R = 2r)."""
        v = self.d1(theta)
        c = np.abs(self.cruzado(theta))
        with np.errstate(divide="ignore", invalid="ignore"):
            out = np.linalg.norm(v, axis=-1) ** 3 / c
        out = np.where(c == 0, np.where(np.linalg.norm(v, axis=-1) == 0, 0.0, np.inf), out)
        return np.inf * np.ones_like(out) if self.degenerada else out

    def rho_fechado(self, theta) -> np.ndarray:  # noqa: ANN001
        """ρ = 4r(R − r)/|R − 2r| · |sin(Rθ/2r)|."""
        if self.degenerada:
            return np.full(np.shape(theta), np.inf)
        return 4 * self.r * self.a / abs(self.R - 2 * self.r) * np.abs(self.seno_meio(theta))

    def tangente_normal(self, theta) -> tuple[np.ndarray, np.ndarray]:  # noqa: ANN001
        """Versores τ (sentido de θ crescente) e n (para o centro de curvatura).

        n = s·(−τ_y, τ_x) com s = sinal de x'y'' − y'x'' (a curva vira para a esquerda se s > 0).
        Indefinidos nos bicos e, na curva degenerada, n também.
        """
        v = self.d1(theta)
        vel = np.linalg.norm(v, axis=-1, keepdims=True)
        with np.errstate(divide="ignore", invalid="ignore"):
            tau = v / vel
        s = np.sign(self.cruzado(theta))[..., None]
        n = s * np.stack([-tau[..., 1], tau[..., 0]], axis=-1)
        return tau, n

    def centro_curvatura(self, theta) -> np.ndarray:  # noqa: ANN001
        """P + ρn: percorre a evoluta (outra hipocicloide, ampliada por R/|R − 2r|)."""
        _, n = self.tangente_normal(theta)
        return self.posicao(theta) + self.rho_fechado(theta)[..., None] * n

    def pontos_seguros(self, n: int, theta_max: float | None = None) -> np.ndarray:
        """n ângulos espalhados pela curva, longe dos bicos (τ, n e ρ definidos).

        O j-ésimo ponto (j = 1…n) fica no arco (j − 1) mod (nº de arcos), na fração j/(n + 1)
        desse arco. Assim os pontos dão a volta na curva e, ao mesmo tempo, passam por
        posições diferentes dentro de um arco (perto do bico, no meio, perto do bico seguinte),
        onde ρ = ρ_max·sin(π·fração) assume valores bem diferentes.
        """
        tm = self.theta_max if theta_max is None else theta_max
        bicos = self.bicos(tm)
        if bicos[-1] < tm - 1e-12:
            bicos = np.append(bicos, tm)
        arcos = len(bicos) - 1
        j = np.arange(1, n + 1)
        i = (j - 1) % arcos
        return np.sort(bicos[i] + (bicos[i + 1] - bicos[i]) * j / (n + 1))


@dataclass(frozen=True)
class Instante:
    """Item 1.7: grandezas de P num instante, com θ = ωt."""

    t: float
    theta: float
    posicao: np.ndarray
    v: np.ndarray            # cartesiana
    a: np.ndarray            # cartesiana
    rapidez: float           # |v| = ds/dt
    a_t: float               # d²s/dt² (componente segundo τ)
    a_n: float               # |v|²/ρ (componente segundo n, ≥ 0)
    rho: float
    tau: np.ndarray
    n: np.ndarray


def instante(h: Hipocicloide, omega: float, t: float) -> Instante:
    """v = ω r'(θ), a = ω² r''(θ) (ω constante), e a decomposição a = a_t τ + a_n n."""
    if not (math.isfinite(omega) and omega > 0):
        raise ErroEntrada("ω precisa ser positivo.")
    th = omega * t
    v = omega * h.d1(th)
    a = omega**2 * h.d2(th)
    rapidez = float(np.linalg.norm(v))
    tau, n = h.tangente_normal(th)
    if abs(float(h.seno_meio(th))) < 1e-12:
        raise ErroEntrada(f"Em t = {t:g} s o ponto P está num bico (v = 0): τ e n não existem.")
    a_t = float(a @ tau)
    a_n = float(a @ n) if not h.degenerada else 0.0
    return Instante(t=float(t), theta=float(th), posicao=h.posicao(th), v=v, a=a, rapidez=rapidez,
                    a_t=a_t, a_n=a_n, rho=float(h.rho_fechado(th)), tau=tau, n=n)


# ------------------------------------------------------------------------- parte 2
@dataclass(frozen=True)
class Frenet:
    """Item 2.2 e 2.3 num ponto da cúbica reversa."""

    lam: float
    posicao: np.ndarray
    tau: np.ndarray
    n: np.ndarray
    b: np.ndarray
    curvatura: float
    rho: float
    torcao: float


class CurvaEspacial:
    """r(λ) = (λ, λ², λ³), a cúbica reversa."""

    @staticmethod
    def posicao(lam) -> np.ndarray:  # noqa: ANN001
        l = np.asarray(lam, dtype=float)
        return np.stack([l, l**2, l**3], axis=-1)

    @staticmethod
    def d1(lam) -> np.ndarray:  # noqa: ANN001
        l = np.asarray(lam, dtype=float)
        return np.stack([np.ones_like(l), 2 * l, 3 * l**2], axis=-1)

    @staticmethod
    def d2(lam) -> np.ndarray:  # noqa: ANN001
        l = np.asarray(lam, dtype=float)
        return np.stack([np.zeros_like(l), 2 * np.ones_like(l), 6 * l], axis=-1)

    @staticmethod
    def d3(lam) -> np.ndarray:  # noqa: ANN001
        l = np.asarray(lam, dtype=float)
        return np.stack([np.zeros_like(l), np.zeros_like(l), 6 * np.ones_like(l)], axis=-1)

    @classmethod
    def frenet(cls, lam: float) -> Frenet:
        """τ = r'/|r'|, b = r'×r''/|r'×r''|, n = b×τ; κ = |r'×r''|/|r'|³; torção = (r'×r'')·r'''/|r'×r''|²."""
        lam = float(lam)
        if not math.isfinite(lam):
            raise ErroEntrada("λ precisa ser um número finito.")
        r1, r2, r3 = cls.d1(lam), cls.d2(lam), cls.d3(lam)
        c = np.cross(r1, r2)
        nr1, nc = float(np.linalg.norm(r1)), float(np.linalg.norm(c))
        tau = r1 / nr1
        b = c / nc
        n = np.cross(b, tau)
        kappa = nc / nr1**3
        return Frenet(lam=lam, posicao=cls.posicao(lam), tau=tau, n=n, b=b, curvatura=kappa,
                      rho=1.0 / kappa, torcao=float(c @ r3) / nc**2)

    @staticmethod
    def rho_fechado(lam) -> np.ndarray:  # noqa: ANN001
        """ρ = (1 + 4λ² + 9λ⁴)^{3/2} / (2√(1 + 9λ² + 9λ⁴))."""
        l = np.asarray(lam, dtype=float)
        return (1 + 4 * l**2 + 9 * l**4) ** 1.5 / (2 * np.sqrt(1 + 9 * l**2 + 9 * l**4))

    @staticmethod
    def torcao_fechada(lam) -> np.ndarray:  # noqa: ANN001
        """Torção = 3/(1 + 9λ² + 9λ⁴)."""
        l = np.asarray(lam, dtype=float)
        return 3 / (1 + 9 * l**2 + 9 * l**4)
