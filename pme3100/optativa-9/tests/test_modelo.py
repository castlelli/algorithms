"""Cada teste é uma afirmação física ou numérica sobre o oscilador."""

from __future__ import annotations

import math

import numpy as np
import pytest
from scipy.integrate import solve_ivp

from codigo.modelo import (
    Coef, ErroDivergencia, ErroEntrada, Parametros, amplitude_harmonica, estroboscopico, gamma_melnikov,
    integrar, lyapunov, orbita_periodica, passo_rk4, periodo_detectado, separatriz,
)

A = Parametros(m=1, k1=-1, k2=1, c=0.3, A=0.37, omega=1.2)
B = Parametros(m=1, k1=-1, k2=1, c=0.3, A=0.0, omega=1.2)
C = Parametros(m=1, k1=-1, k2=1, c=0.3, A=0.50, omega=1.2)


def referencia(p: Parametros, x0: float, v0: float, tmax: float) -> np.ndarray:
    """Solução de referência independente (DOP853, tolerância próxima da precisão de máquina)."""
    d, a, b, g, w = p.coef
    f = lambda t, y: [y[1], g * np.cos(w * t) - d * y[1] - a * y[0] - b * y[0] ** 3]  # noqa: E731
    return solve_ivp(f, (0, tmax), [x0, v0], method="DOP853", rtol=1e-13, atol=1e-14).y[:, -1]


def test_ordem_do_rk4() -> None:
    """Dividir h por 2 divide o erro por 2⁴ = 16: é o que define um método de 4a ordem."""
    ref = referencia(C, 1.0, 0.0, 20.0)
    erros = [np.hypot(*(np.array([(tr := integrar(C, 1.0, 0.0, 20.0, h=h)).x[-1], tr.v[-1]]) - ref))
             for h in (0.04, 0.02, 0.01, 0.005)]
    ordens = np.log2(np.array(erros[:-1]) / np.array(erros[1:]))
    assert np.all(np.abs(ordens - 4) < 0.1), ordens


def test_concorda_com_dop853() -> None:
    tr = integrar(A, 0.5, -0.3, 60.0)
    ref = referencia(A, 0.5, -0.3, 60.0)
    assert abs(tr.x[-1] - ref[0]) < 1e-6 and abs(tr.v[-1] - ref[1]) < 1e-6


def test_limite_linear_analitico() -> None:
    """k2 = 0: oscilador forçado linear, com solução exata (homogênea + particular)."""
    m, k, c, F, w = 2.0, 8.0, 0.6, 1.5, 1.7
    p = Parametros(m, k, 0.0, c, F, w)
    x0, v0 = 0.4, -0.2
    sig, wd = c / (2 * m), math.sqrt(k / m - (c / (2 * m)) ** 2)
    den = (k - m * w * w) ** 2 + (c * w) ** 2
    a_p, b_p = F * (k - m * w * w) / den, F * c * w / den  # x_p = a cos(wt) + b sin(wt)
    C1 = x0 - a_p
    C2 = (v0 - b_p * w + sig * C1) / wd
    tr = integrar(p, x0, v0, 30.0, h=0.002)
    exata = (np.exp(-sig * tr.t) * (C1 * np.cos(wd * tr.t) + C2 * np.sin(wd * tr.t))
             + a_p * np.cos(w * tr.t) + b_p * np.sin(w * tr.t))
    assert np.max(np.abs(tr.x - exata)) < 1e-11


def test_energia_conservada_sem_atrito_e_sem_forca() -> None:
    p = Parametros(1, -1, 1, 0, 0, 1.2)
    tr = integrar(p, 0.2, 0.9, 100.0, h=0.005)
    E = p.energia(tr.x, tr.v)
    assert np.max(np.abs(E - E[0])) < 1e-9


def test_balanco_de_energia() -> None:
    """E(t) − E(0) = ∫(−c v² + F v) dt: a dissipação e o trabalho da força fecham a conta."""
    from scipy.integrate import simpson

    tr = integrar(C, 1.0, 0.0, 100.0, h=0.005)
    potencia = -C.c * tr.v**2 + C.forca(tr.t) * tr.v
    fecho = C.energia(tr.x[-1], tr.v[-1]) - C.energia(tr.x[0], tr.v[0]) - simpson(potencia, x=tr.t)
    assert abs(fecho) < 1e-8


def test_soma_dos_lyapunov_igual_a_menos_delta() -> None:
    """Em qualquer órbita, λ1 + λ2 = −δ: a área no espaço de fases contrai a taxa δ exatamente."""
    l1, l2 = lyapunov(C.coef, np.array([1.0, 0.2]), np.array([0.0, 0.5]), 0, 100)
    assert np.max(np.abs(l1 + l2 + 0.3)) < 1e-6


def test_autovalores_dos_equilibrios() -> None:
    d = 0.3
    eq = dict((x, ev) for x, ev in B.equilibrios())
    assert set(eq) == {-1.0, 0.0, 1.0}
    sela = np.sort(eq[0.0].real)
    assert sela == pytest.approx([(-d - math.sqrt(d * d + 4)) / 2, (-d + math.sqrt(d * d + 4)) / 2])
    for x in (-1.0, 1.0):
        assert np.all(eq[x].real == pytest.approx(-d / 2))
        assert np.max(eq[x].imag) == pytest.approx(math.sqrt(8 - d * d) / 2)


def test_taxa_de_decaimento_numerica_no_poco() -> None:
    """Perto de x = 1 sem força, a integração reproduz o amortecimento e−δt/2 e a frequência teórica."""
    tr = integrar(B, 1.0 + 1e-4, 0.0, 30.0, h=0.002)
    wd = math.sqrt(8 - 0.09) / 2
    C2 = 0.15 * 1e-4 / wd
    linear = 1 + np.exp(-0.15 * tr.t) * (1e-4 * np.cos(wd * tr.t) + C2 * np.sin(wd * tr.t))
    assert np.max(np.abs(tr.x - linear)) < 2e-7  # o desvio é o termo quadrático ~ (1e-4)²·3


def test_simetria_de_espelho() -> None:
    """(x, v, t) → (−x, −v, t + T/2) leva soluções em soluções."""
    c = C.coef
    direta = estroboscopico(c, 0.7, 0.1, 6)
    espelho = estroboscopico(c, -0.7, -0.1, 6, fase_inicial=0.5)
    assert np.max(np.abs(direta + espelho)) < 1e-9


def test_invariancia_de_escala() -> None:
    """Multiplicar (m, k1, k2, c, A) pelo mesmo fator não muda δ, α, β, γ nem o movimento."""
    p2 = Parametros(2.5, -2.5, 2.5, 0.75, 0.925, 1.2)
    assert p2.coef == pytest.approx(A.coef)
    t1, t2 = integrar(A, 1, 0, 50), integrar(p2, 1, 0, 50)
    assert np.max(np.abs(t1.x - t2.x)) < 1e-12


def test_conjunto_igual_a_individuais() -> None:
    """Integrar um array dá exatamente o mesmo que integrar cada trajetória sozinha."""
    x0, v0 = np.array([0.1, -0.7, 1.3]), np.array([0.0, 0.5, -1.0])
    lote = integrar(A, x0, v0, 20.0, h=0.02)
    for i in range(3):
        um = integrar(A, x0[i], v0[i], 20.0, h=0.02)
        assert lote.x[-1, i] == um.x[-1]


def test_passo_cai_exatamente_em_tmax() -> None:
    tr = integrar(A, 1, 0, 17.3)
    assert tr.t[-1] == pytest.approx(17.3, abs=1e-12)


@pytest.mark.parametrize("gamma, periodo", [(0.20, 1), (0.28, 2), (0.29, 4), (0.37, 5), (0.65, 2)])
def test_periodos_da_literatura(gamma: float, periodo: int) -> None:
    """Sequência conhecida para α = −1, β = 1, δ = 0,3, ω = 1,2."""
    c = Coef(0.3, -1.0, 1.0, gamma, 1.2)
    x0, v0 = np.array([1.0, -1.0, 0.3, 0.0]), np.array([0.0, 0.5, -1.0, 1.5])
    s = estroboscopico(c, x0, v0, 1000, spp=100)[-120:]
    assert np.all(periodo_detectado(s, tol=1e-4) == periodo)


def test_caos_em_gamma_050() -> None:
    l1, _ = lyapunov(C.coef, 1.0, 0.0, 200, 1000, spp=100)
    s = estroboscopico(C.coef, 1.0, 0.0, 400, spp=100)[-120:]
    assert l1 > 0.05 and periodo_detectado(s) == 0


def test_separatriz_decide_o_poco() -> None:
    """Pontos logo de cada lado da separatriz terminam em poços opostos."""
    ramo = separatriz(B)[0]
    x, v = ramo[len(ramo) // 2]
    normal = 1e-3
    um = integrar(B, x + normal, v, 200.0, h=0.01)
    outro = integrar(B, x - normal, v, 200.0, h=0.01)
    assert abs(abs(um.x[-1]) - 1) < 1e-4 and abs(abs(outro.x[-1]) - 1) < 1e-4
    assert um.x[-1] * outro.x[-1] < 0


@pytest.mark.parametrize("kw", [dict(m=0), dict(m=-1), dict(c=-0.1), dict(omega=-1), dict(k1=math.nan)])
def test_rejeita_entrada_invalida(kw: dict) -> None:
    base = dict(m=1, k1=1, k2=1, c=0.1, A=0.1, omega=1)
    with pytest.raises(ErroEntrada):
        Parametros(**{**base, **kw})


def test_rejeita_tmax_invalido() -> None:
    with pytest.raises(ErroEntrada):
        integrar(A, 1, 0, -1)


def test_detecta_divergencia() -> None:
    """Com k2 < 0 a mola amolece sem limite: o programa precisa avisar, não devolver lixo."""
    p = Parametros(1, 1, -1, 0.0, 0.0, 1.0)
    with pytest.raises(ErroDivergencia):
        integrar(p, 2.0, 1.0, 100.0)


def test_um_passo_a_mao() -> None:
    """Um passo aberto escalar reproduz passo_rk4 bit a bit (base da conta mostrada no relatório)."""
    c = A.coef
    h = A.T / 200
    d, a, b, g, w = c
    f = lambda t, x, v: g * math.cos(w * t) - d * v - a * x - b * x**3  # noqa: E731
    x, v = 1.0, 0.0
    k1x, k1v = v, f(0, x, v)
    k2x, k2v = v + h / 2 * k1v, f(h / 2, x + h / 2 * k1x, v + h / 2 * k1v)
    k3x, k3v = v + h / 2 * k2v, f(h / 2, x + h / 2 * k2x, v + h / 2 * k2v)
    k4x, k4v = v + h * k3v, f(h, x + h * k3x, v + h * k3v)
    xn = x + h / 6 * (k1x + 2 * k2x + 2 * k3x + k4x)
    vn = v + h / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)
    assert passo_rk4(0.0, x, v, h, c) == pytest.approx((xn, vn), abs=1e-15)


def test_melnikov_contra_integral_numerica() -> None:
    """A forma fechada do limiar coincide com a integral de Melnikov calculada numericamente."""
    from scipy.integrate import quad

    w, d = 1.2, 0.3
    v0 = lambda t: -math.sqrt(2) / math.cosh(t) * math.tanh(t)  # noqa: E731
    dissipa = quad(lambda t: v0(t) ** 2, -30, 30, limit=400)[0]
    forca = abs(quad(lambda t: v0(t) * math.sin(w * t), -30, 30, limit=400)[0])
    assert dissipa == pytest.approx(4 / 3, abs=1e-9)
    assert gamma_melnikov(d, w) == pytest.approx(d * dissipa / forca, abs=1e-9)


def test_floquet_coincide_com_lyapunov() -> None:
    """Na órbita periódica, ln|mu|/(nT) são os expoentes de Lyapunov, e o produto de mu é e^(-delta nT)."""
    s = estroboscopico(A.coef, 1.0, 0.0, 400)[-1]
    z, mu, res = orbita_periodica(A.coef, s[0], s[1], 5)
    nT = 5 * A.T
    assert res < 1e-11
    assert abs(mu[0] * mu[1]) == pytest.approx(math.exp(-0.3 * nT), rel=2e-6)  # truncamento do RK4
    l1, l2 = lyapunov(A.coef, z[0], z[1], 0, 200)
    assert sorted(np.log(np.abs(mu)) / nT) == pytest.approx([float(l2), float(l1)], abs=2e-3)


def test_periodo_um_tem_expoente_menos_delta_sobre_dois() -> None:
    """Multiplicadores complexos conjugados têm |mu| = e^(-delta T/2), logo lambda = -delta/2 exatamente."""
    p = Parametros(1, 1, 1, 0.3, 0.37, 1.2)
    s = estroboscopico(p.coef, 1.0, 0.0, 150)[-1]
    _, mu, _ = orbita_periodica(p.coef, s[0], s[1], 1)
    assert abs(mu[0].imag) > 0
    assert np.log(np.abs(mu)) / p.T == pytest.approx([-0.15, -0.15], abs=1e-7)


def test_amplitude_harmonica() -> None:
    t = np.arange(4000) * 2 * math.pi / 1.2 / 400
    x = 0.7 * np.cos(1.2 * t + 0.3) + 0.1 * np.cos(3.6 * t)
    assert amplitude_harmonica(t, x, 1.2) == pytest.approx(0.7)
    assert amplitude_harmonica(t, x, 3.6) == pytest.approx(0.1)
    assert amplitude_harmonica(t, x, 2.4) == pytest.approx(0, abs=1e-10)
