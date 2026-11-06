"""Oscilador de Duffing: modelo físico, integrador RK4 e medidas dinâmicas.

    m x'' + c x' + k1 x + k2 x^3 = A cos(omega t)

Dividindo por m:

    x'' + delta x' + alpha x + beta x^3 = gamma cos(omega t)

Todas as rotinas numéricas aceitam x0 e v0 como escalares ou arrays: um array integra
um conjunto de trajetórias de uma só vez, cada elemento independente dos demais.
O coeficiente gamma também pode ser um array (usado no diagrama de bifurcação).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import NamedTuple

import numpy as np

PASSOS_POR_PERIODO = 200  # passo padrão: h = T/200
LIMITE_DIVERGENCIA = 1e6  # |x| ou |v| acima disso é tratado como divergência


class ErroEntrada(ValueError):
    """Dado de entrada fisicamente inválido."""


class ErroDivergencia(RuntimeError):
    """A solução cresceu sem limite (possível, por exemplo, com k2 < 0)."""


class Coef(NamedTuple):
    """Coeficientes da equação normalizada (divididos por m)."""

    delta: float
    alpha: float
    beta: float
    gamma: float | np.ndarray
    omega: float


@dataclass(frozen=True)
class Parametros:
    """Dados físicos de entrada, em unidades do SI."""

    m: float
    k1: float
    k2: float
    c: float
    A: float
    omega: float

    def __post_init__(self) -> None:
        for nome in ("m", "k1", "k2", "c", "A", "omega"):
            if not math.isfinite(getattr(self, nome)):
                raise ErroEntrada(f"{nome} precisa ser um número finito")
        if self.m <= 0:
            raise ErroEntrada("a massa m precisa ser positiva")
        if self.c < 0:
            raise ErroEntrada("a constante de amortecimento c não pode ser negativa")
        if self.omega < 0:
            raise ErroEntrada("a frequência omega não pode ser negativa")

    @property
    def coef(self) -> Coef:
        m = self.m
        return Coef(self.c / m, self.k1 / m, self.k2 / m, self.A / m, self.omega)

    @property
    def T(self) -> float:
        """Período da força; infinito se omega = 0."""
        return 2 * math.pi / self.omega if self.omega > 0 else math.inf

    def energia(self, x, v):
        """Energia mecânica E = m v^2/2 + k1 x^2/2 + k2 x^4/4."""
        return 0.5 * self.m * v * v + 0.5 * self.k1 * x * x + 0.25 * self.k2 * x**4

    def forca(self, t):
        return self.A * np.cos(self.omega * t)

    def equilibrios(self) -> list[tuple[float, np.ndarray]]:
        """Para A = 0: pares (x*, autovalores da linearização) de cada equilíbrio."""
        d, a, b, _, _ = self.coef
        xs = [0.0]
        if b != 0 and -a / b > 0:
            r = math.sqrt(-a / b)
            xs = [-r, 0.0, r]
        saida = []
        for x in xs:
            J = np.array([[0.0, 1.0], [-(a + 3 * b * x * x), -d]])
            saida.append((x, np.linalg.eigvals(J)))
        return saida


# ---------------------------------------------------------------------- integrador
def aceleracao(t: float, x, v, c: Coef):
    """x'' isolado da equação do movimento."""
    d, a, b, g, w = c
    return g * math.cos(w * t) - d * v - a * x - b * x * x * x


def passo_rk4(t: float, x, v, h: float, c: Coef):
    """Um passo de Runge-Kutta clássico de 4ª ordem para (x, v)."""
    k1x = v
    k1v = aceleracao(t, x, v, c)

    k2x = v + 0.5 * h * k1v
    k2v = aceleracao(t + 0.5 * h, x + 0.5 * h * k1x, k2x, c)

    k3x = v + 0.5 * h * k2v
    k3v = aceleracao(t + 0.5 * h, x + 0.5 * h * k2x, k3x, c)

    k4x = v + h * k3v
    k4v = aceleracao(t + h, x + h * k3x, k4x, c)

    x_novo = x + h / 6 * (k1x + 2 * k2x + 2 * k3x + k4x)
    v_novo = v + h / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)
    return x_novo, v_novo


def passo_padrao(p: Parametros, x0, v0) -> float:
    """h pequeno frente ao período da força e à oscilação mais rápida da mola."""
    d, a, b, _, _ = p.coef
    amplitude = max(float(np.max(np.abs(x0))), float(np.max(np.abs(v0))), 1.0)
    rigidez = abs(a) + 3 * abs(b) * amplitude**2
    h_mola = 2 * math.pi / (math.sqrt(rigidez) + d + 1e-12) / 100
    return min(p.T / PASSOS_POR_PERIODO, h_mola)


def _conferir(x, v, t: float) -> None:
    if not (np.all(np.abs(x) < LIMITE_DIVERGENCIA) and np.all(np.abs(v) < LIMITE_DIVERGENCIA)):
        raise ErroDivergencia(f"a solução divergiu perto de t = {t:.4g} s")


@dataclass(frozen=True)
class Trajetoria:
    t: np.ndarray
    x: np.ndarray  # eixo 0 = tempo
    v: np.ndarray
    h: float


def integrar(p: Parametros, x0, v0, tmax: float, h: float | None = None,
             guardar_cada: int = 1) -> Trajetoria:
    """Integra de t = 0 a tmax. O h é ajustado para o último passo cair exatamente em tmax."""
    if not (math.isfinite(tmax) and tmax > 0):
        raise ErroEntrada("t_max precisa ser positivo")
    x, v = np.asarray(x0, float), np.asarray(v0, float)
    if not (np.all(np.isfinite(x)) and np.all(np.isfinite(v))):
        raise ErroEntrada("as condições iniciais precisam ser finitas")
    h_alvo = passo_padrao(p, x, v) if h is None else h
    if h_alvo <= 0:
        raise ErroEntrada("o passo h precisa ser positivo")
    n = max(1, math.ceil(tmax / h_alvo - 1e-9))
    h_real = tmax / n
    c = p.coef
    n_guardar = n // guardar_cada + 1
    xs = np.empty((n_guardar, *x.shape))
    vs = np.empty((n_guardar, *x.shape))
    xs[0], vs[0] = x, v
    with np.errstate(over="ignore", invalid="ignore"):
        for k in range(n):
            # t = k*h, e não t += h: assim o erro de arredondamento do tempo não se acumula.
            x, v = passo_rk4(k * h_real, x, v, h_real, c)
            if (k + 1) % 64 == 0:
                _conferir(x, v, (k + 1) * h_real)
            if (k + 1) % guardar_cada == 0:
                j = (k + 1) // guardar_cada
                xs[j], vs[j] = x, v
    _conferir(x, v, tmax)
    t = np.arange(n_guardar) * guardar_cada * h_real
    return Trajetoria(t, xs, vs, h_real)


def estroboscopico(c: Coef, x0, v0, n_periodos: int, spp: int = PASSOS_POR_PERIODO,
                   fase_inicial: float = 0.0) -> np.ndarray:
    """Seção de Poincaré: estado a cada período T da força, de t = 0 a n_periodos*T.

    Devolve um array (n_periodos + 1, ..., 2) com x em [..., 0] e v em [..., 1].
    ``fase_inicial`` é o instante inicial como fração de T.
    """
    T = 2 * math.pi / c.omega
    h = T / spp
    x, v = np.broadcast_arrays(np.asarray(x0, float), np.asarray(v0, float))
    x, v = x.copy(), v.copy()
    saida = np.empty((n_periodos + 1, *x.shape, 2))
    saida[0, ..., 0], saida[0, ..., 1] = x, v
    for n in range(n_periodos):
        t_ini = (n + fase_inicial) * T
        for k in range(spp):
            x, v = passo_rk4(t_ini + k * h, x, v, h, c)
        saida[n + 1, ..., 0], saida[n + 1, ..., 1] = x, v
    return saida


def periodo_detectado(secao: np.ndarray, tol: float = 1e-5, maximo: int = 32) -> np.ndarray:
    """Menor p tal que o mapa estroboscópico repete a cada p períodos; 0 se nenhum repetir.

    ``secao`` tem forma (n, ..., 2) e deve conter apenas o regime permanente.
    """
    if secao.shape[0] <= maximo:
        raise ValueError("seção curta demais para o período máximo pedido")
    resultado = np.zeros(secao.shape[1:-1], dtype=int)
    for p in range(maximo, 0, -1):  # do maior para o menor: o último acerto é o menor p
        erro = np.max(np.linalg.norm(secao[p:] - secao[:-p], axis=-1), axis=0)
        resultado = np.where(erro < tol, p, resultado)
    return resultado


# ------------------------------------------------------------- expoentes de Lyapunov
def _campo_tangente(t: float, y: np.ndarray, c: Coef) -> np.ndarray:
    """Estado (x, v) mais dois vetores tangentes (u1, w1) e (u2, w2): equação variacional."""
    d, a, b, g, w = c
    x, v = y[0], y[1]
    rigidez = a + 3 * b * x * x
    f = np.empty_like(y)
    f[0] = v
    f[1] = g * math.cos(w * t) - d * v - a * x - b * x * x * x
    f[2] = y[3]
    f[3] = -rigidez * y[2] - d * y[3]
    f[4] = y[5]
    f[5] = -rigidez * y[4] - d * y[5]
    return f


def lyapunov(c: Coef, x0, v0, n_descarte: int, n_medida: int,
             spp: int = PASSOS_POR_PERIODO) -> tuple[np.ndarray, np.ndarray]:
    """Dois expoentes de Lyapunov (Benettin): evolui 2 vetores tangentes e os reortonormaliza
    por Gram-Schmidt a cada período. Devolve (lambda1, lambda2), com lambda1 >= lambda2.
    """
    T = 2 * math.pi / c.omega
    h = T / spp
    x, v = np.broadcast_arrays(np.asarray(x0, float), np.asarray(v0, float))
    y = np.zeros((6, *x.shape))
    y[0], y[1], y[2], y[5] = x, v, 1.0, 1.0
    soma1, soma2 = np.zeros(x.shape), np.zeros(x.shape)
    for n in range(n_descarte + n_medida):
        for k in range(spp):
            t = n * T + k * h
            k1 = _campo_tangente(t, y, c)
            k2 = _campo_tangente(t + 0.5 * h, y + 0.5 * h * k1, c)
            k3 = _campo_tangente(t + 0.5 * h, y + 0.5 * h * k2, c)
            k4 = _campo_tangente(t + h, y + h * k3, c)
            y = y + h / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
        # Gram-Schmidt: os logaritmos das normas medem o crescimento em cada direção.
        n1 = np.hypot(y[2], y[3])
        y[2] /= n1
        y[3] /= n1
        proj = y[2] * y[4] + y[3] * y[5]
        y[4] -= proj * y[2]
        y[5] -= proj * y[3]
        n2 = np.hypot(y[4], y[5])
        y[4] /= n2
        y[5] /= n2
        if n >= n_descarte:
            soma1 += np.log(n1)
            soma2 += np.log(n2)
    duracao = n_medida * T
    return soma1 / duracao, soma2 / duracao


# ------------------------------------------------------------- órbitas periódicas e Floquet
def mapa_e_jacobiana(c: Coef, x: float, v: float, n_periodos: int, spp: int = PASSOS_POR_PERIODO,
                     fase_inicial: float = 0.0) -> tuple[np.ndarray, np.ndarray]:
    """Estado após n períodos da força e a matriz de monodromia, pela equação variacional."""
    T = 2 * math.pi / c.omega
    h = T / spp
    y = np.array([x, v, 1.0, 0.0, 0.0, 1.0])
    for k in range(n_periodos * spp):
        t = fase_inicial * T + k * h
        k1 = _campo_tangente(t, y, c)
        k2 = _campo_tangente(t + 0.5 * h, y + 0.5 * h * k1, c)
        k3 = _campo_tangente(t + 0.5 * h, y + 0.5 * h * k2, c)
        k4 = _campo_tangente(t + h, y + h * k3, c)
        y = y + h / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
    return y[:2], np.array([[y[2], y[4]], [y[3], y[5]]])


def orbita_periodica(c: Coef, x: float, v: float, n_periodos: int, spp: int = PASSOS_POR_PERIODO,
                     max_iter: int = 12, tol: float = 1e-12):
    """Newton sobre P^n(z) = z, onde P é o mapa de um período da força.

    Devolve (z, multiplicadores de Floquet, resíduo). A órbita é estável se |mu| < 1 em ambos.
    """
    z = np.array([x, v], float)
    for _ in range(max_iter):
        F, J = mapa_e_jacobiana(c, z[0], z[1], n_periodos, spp)
        r = F - z
        if math.hypot(*r) < tol:
            break
        z = z + np.linalg.solve(J - np.eye(2), -r)
    F, J = mapa_e_jacobiana(c, z[0], z[1], n_periodos, spp)
    return z, np.linalg.eigvals(J), float(math.hypot(*(F - z)))


def gamma_melnikov(delta: float, omega: float) -> float:
    """Limiar de Melnikov do poço duplo com alpha = -1 e beta = 1."""
    return delta * 4 * math.cosh(math.pi * omega / 2) / (3 * math.sqrt(2) * math.pi * omega)


def amplitude_harmonica(t: np.ndarray, x: np.ndarray, omega: float) -> float:
    """Amplitude da componente de Fourier em omega, sobre um número inteiro de períodos."""
    return float(2 * abs(np.mean(x * np.exp(-1j * omega * t))))


# ------------------------------------------------------------ separatriz do caso A = 0
def separatriz(p: Parametros, x_max: float = 2.6, h: float = 0.005) -> list[np.ndarray]:
    """Variedade estável da sela em x = 0, por integração para trás no tempo.

    São dois ramos, um espelho do outro; cada um é devolvido como array (n, 2). Essa curva
    é a fronteira entre as bacias dos dois poços.
    """
    d, a, b, _, _ = p.coef
    if a >= 0 or b <= 0:
        raise ErroEntrada("a separatriz só existe no duplo poço (k1 < 0, k2 > 0)")
    autoval = (-d - math.sqrt(d * d - 4 * a)) / 2  # autovalor estável da sela (negativo)
    direcao = np.array([1.0, autoval]) / math.hypot(1.0, autoval)
    c = Coef(d, a, b, 0.0, 0.0)
    ramos = []
    for sinal in (1.0, -1.0):
        x, v = sinal * 1e-6 * direcao
        pontos = [(0.0, 0.0), (x, v)]
        # Com o passo negativo, o tempo corre ao contrário e a trajetória foge da sela.
        for _ in range(200_000):
            x, v = passo_rk4(0.0, x, v, -h, c)
            pontos.append((x, v))
            if abs(x) > x_max or abs(v) > x_max * 2:
                break
        ramos.append(np.array(pontos))
    return ramos
