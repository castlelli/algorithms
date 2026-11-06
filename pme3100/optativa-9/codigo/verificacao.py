"""Medidas que sustentam a tabela de verificação do relatório. Cada linha traz o valor medido."""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from scipy.integrate import simpson, solve_ivp

from .casos import CASOS
from .modelo import Coef, Parametros, estroboscopico, integrar, lyapunov, passo_rk4, periodo_detectado

A, B, C = (CASOS[k].p for k in "ABC")


@dataclass(frozen=True)
class Linha:
    afirmacao: str
    medido: float
    limite: float
    unidade: str = ""


def _referencia(p: Parametros, x0: float, v0: float, tmax: float) -> np.ndarray:
    d, a, b, g, w = p.coef
    f = lambda t, y: [y[1], g * np.cos(w * t) - d * y[1] - a * y[0] - b * y[0] ** 3]  # noqa: E731
    return solve_ivp(f, (0, tmax), [x0, v0], method="DOP853", rtol=1e-13, atol=1e-14).y[:, -1]


def linhas(ordens: np.ndarray) -> list[Linha]:
    """Executa os ensaios analíticos; o limite é o usado em tests/test_modelo.py."""
    saida = [Linha(r"Ordem do RK4 no passo mais fino", float(ordens[-1]), 4.1)]

    tr = integrar(A, 0.5, -0.3, 60.0)
    ref = _referencia(A, 0.5, -0.3, 60.0)
    saida.append(Linha(r"Diferença em relação ao DOP853 em $t=60$ s, caso A", math.hypot(tr.x[-1] - ref[0], tr.v[-1] - ref[1]), 1e-6, "m"))

    m, k, c, F, w = 2.0, 8.0, 0.6, 1.5, 1.7
    sig, wd = c / (2 * m), math.sqrt(k / m - (c / (2 * m)) ** 2)
    den = (k - m * w * w) ** 2 + (c * w) ** 2
    a_p, b_p = F * (k - m * w * w) / den, F * c * w / den
    C1 = 0.4 - a_p
    C2 = (-0.2 - b_p * w + sig * C1) / wd
    tr = integrar(Parametros(m, k, 0.0, c, F, w), 0.4, -0.2, 30.0, h=0.002)
    exata = (np.exp(-sig * tr.t) * (C1 * np.cos(wd * tr.t) + C2 * np.sin(wd * tr.t))
             + a_p * np.cos(w * tr.t) + b_p * np.sin(w * tr.t))
    saida.append(Linha(r"Mola linear ($k_2=0$) em relação à solução exata", float(np.max(np.abs(tr.x - exata))), 1e-11, "m"))

    p = Parametros(1, -1, 1, 0, 0, 1.2)
    tr = integrar(p, 0.2, 0.9, 100.0, h=0.005)
    E = p.energia(tr.x, tr.v)
    saida.append(Linha(r"Variação de $E$ com $c=A=0$", float(np.max(np.abs(E - E[0]))), 1e-9, "J"))

    tr = integrar(C, 1.0, 0.0, 100.0, h=0.005)
    pot = -C.c * tr.v**2 + C.forca(tr.t) * tr.v
    fecho = C.energia(tr.x[-1], tr.v[-1]) - C.energia(1.0, 0.0) - simpson(pot, x=tr.t)
    saida.append(Linha(r"Resíduo de $\Delta E=\int(-c\dot{x}^2+F\dot{x})\,dt$", abs(fecho), 1e-8, "J"))

    l1, l2 = lyapunov(C.coef, np.array([1.0, 0.2]), np.array([0.0, 0.5]), 0, 100)
    saida.append(Linha(r"Desvio de $\lambda_1+\lambda_2=-\delta$", float(np.max(np.abs(l1 + l2 + 0.3))), 1e-6, "1/s"))

    d1 = estroboscopico(C.coef, 0.7, 0.1, 6)
    d2 = estroboscopico(C.coef, -0.7, -0.1, 6, fase_inicial=0.5)
    saida.append(Linha(r"Simetria $(x,\dot{x},t)\to(-x,-\dot{x},t+T/2)$", float(np.max(np.abs(d1 + d2))), 1e-9))

    p2 = Parametros(2.5, -2.5, 2.5, 0.75, 0.925, 1.2)
    t1, t2 = integrar(A, 1, 0, 50), integrar(p2, 1, 0, 50)
    saida.append(Linha(r"Mudança de escala: todos os dados $\times 2{,}5$", float(np.max(np.abs(t1.x - t2.x))), 1e-12, "m"))
    from .modelo import gamma_melnikov, orbita_periodica
    from scipy.integrate import quad

    v0 = lambda t: -math.sqrt(2) / math.cosh(t) * math.tanh(t)  # noqa: E731
    integral = 0.3 * quad(lambda t: v0(t) ** 2, -30, 30, limit=400)[0] / abs(quad(lambda t: v0(t) * math.sin(1.2 * t), -30, 30, limit=400)[0])
    saida.append(Linha(r"Limiar de Melnikov: forma fechada e integral numérica", abs(gamma_melnikov(0.3, 1.2) - integral), 1e-9))
    s = estroboscopico(A.coef, 1.0, 0.0, 400)[-1]
    _, mu, res = orbita_periodica(A.coef, s[0], s[1], 5)
    saida.append(Linha(r"Resíduo de Newton na órbita de período 5", res, 1e-11))
    return saida


def periodos_da_literatura() -> list[tuple[float, str, str]]:
    """Regime detectado para a sequência publicada de γ, com a mesma rotina dos outros casos."""
    esperado = {0.20: "1", 0.28: "2", 0.29: "4", 0.37: "5", 0.50: "caos", 0.65: "2"}
    saida = []
    for gamma, alvo in esperado.items():
        c = Coef(0.3, -1.0, 1.0, gamma, 1.2)
        s = estroboscopico(c, 1.0, 0.0, 1000, spp=100)[-120:]
        per = int(periodo_detectado(s, tol=1e-4))
        saida.append((gamma, alvo, str(per) if per else "caos"))
    return saida


def passo_a_mao() -> dict:
    """Um passo de RK4 aberto, caso A, a partir de x = 1, v = 0, em t = 0."""
    c = A.coef
    d, a, b, g, w = c
    h = A.T / 200
    f = lambda t, x, v: g * math.cos(w * t) - d * v - a * x - b * x**3  # noqa: E731
    x, v = 1.0, 0.0
    k1x, k1v = v, f(0.0, x, v)
    k2x, k2v = v + h / 2 * k1v, f(h / 2, x + h / 2 * k1x, v + h / 2 * k1v)
    k3x, k3v = v + h / 2 * k2v, f(h / 2, x + h / 2 * k2x, v + h / 2 * k2v)
    k4x, k4v = v + h * k3v, f(h, x + h * k3x, v + h * k3v)
    xn = x + h / 6 * (k1x + 2 * k2x + 2 * k3x + k4x)
    vn = v + h / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)
    xp, vp = passo_rk4(0.0, x, v, h, c)
    if abs(xp - xn) > 1e-15 or abs(vp - vn) > 1e-15:
        raise RuntimeError("o passo aberto não coincide com passo_rk4")
    return dict(h=h, k1x=k1x, k1v=k1v, k2x=k2x, k2v=k2v, k3x=k3x, k3v=k3v, k4x=k4x, k4v=k4v, xn=xn, vn=vn, xp=xp, vp=vp)
