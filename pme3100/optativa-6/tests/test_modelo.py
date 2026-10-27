"""Testes da cinemática (seção 5 do plano)."""

from __future__ import annotations

import numpy as np
import pytest

from codigo.casos import CASOS
from codigo.modelo import (
    ACELERACOES, VELOCIDADES, ErroEntrada, Movimento, Parametros, grupo_no_instante,
)
from codigo.verificacao import erros_derivada, verificar

TODOS = [pytest.param(c.p, id=c.nome) for c in CASOS.values()] + [
    # Lei sem forma fechada: força o caminho numérico (DOP853).
    pytest.param(Parametros(R=2, phi0=0.3, omega="exp(sin(t))", v="0.2 + 0.05*t^2", dt=1), id="numerico"),
]


@pytest.fixture(scope="module", params=TODOS)
def mov(request: pytest.FixtureRequest) -> Movimento:
    return Movimento(request.param)


def test_composicao(mov: Movimento) -> None:
    """v_abs = v_rel + v_arr e a_abs = a_rel + a_arr + a_cor, contra a derivada direta de x(t), y(t)."""
    tt = np.linspace(0.0, mov.t_f, 501)
    e = mov.estado(tt)
    v_dir, a_dir = mov.derivadas_diretas(tt)
    np.testing.assert_allclose(e.cartesiano("v_rel") + e.cartesiano("v_arr"), v_dir, rtol=0, atol=1e-9)
    np.testing.assert_allclose(
        e.cartesiano("a_rel") + e.cartesiano("a_arr") + e.cartesiano("a_cor"), a_dir, rtol=0, atol=1e-9)
    np.testing.assert_allclose(e.a_arr, e.a_arr_t + e.a_arr_n, atol=1e-15)


def test_derivada_numerica(mov: Movimento) -> None:
    """d(OF)/dt numérica = v_abs e d(v_abs)/dt numérica = a_abs: prova Coriolis e arrastamento."""
    _, err_v, err_a = erros_derivada(mov)
    assert err_v.max() < 1e-5
    assert err_a.max() < 1e-5


def test_todas_as_checagens_do_relatorio(mov: Movimento) -> None:
    reprovadas = [c.chave for c in verificar(mov) if not c.aprovado]
    assert reprovadas == []


def test_caso_constante_analitico() -> None:
    w, v, R = 0.5, 0.25, 2.0
    mov = Movimento(Parametros(R=R, phi0=0, omega=str(w), v=str(v), dt=1))
    assert mov.simbolico
    assert mov.t_f == pytest.approx(R / v, abs=1e-12)
    tt = np.linspace(0, mov.t_f, 101)
    e = mov.estado(tt)
    np.testing.assert_allclose(e.modulo("a_cor"), 2 * w * v, atol=1e-12)
    np.testing.assert_allclose(e.a_arr[:, 0], -w**2 * e.r, atol=1e-12)
    np.testing.assert_allclose(e.a_arr[:, 1], 0, atol=1e-12)
    np.testing.assert_allclose(e.a_rel, 0, atol=1e-12)
    np.testing.assert_allclose(e.phi, w * tt, atol=1e-12)


def test_omega_nula_so_movimento_relativo() -> None:
    mov = Movimento(Parametros(R=1.5, phi0=0.7, omega="0", v="0.3 + 0.1*t", dt=0.5))
    e = mov.estado(np.linspace(0, mov.t_f, 101))
    for nome in ("v_arr", "a_arr", "a_cor"):
        np.testing.assert_allclose(e.polar(nome), 0, atol=1e-15)
    np.testing.assert_allclose(e.v_abs, e.v_rel, atol=1e-15)
    np.testing.assert_allclose(e.a_abs, e.a_rel, atol=1e-15)


def test_nao_chega_ao_centro() -> None:
    mov = Movimento(Parametros(R=2, phi0=0, omega="1", v="0.01", dt=1, tmax=20))
    assert not mov.chegou and mov.t_f == 20


@pytest.mark.parametrize("v", ["__import__('os').system('ls')", "t.real", "x + 1", "sin(t",
                               "2t", "1j", "", "lambda: 1"])
def test_expressao_invalida(v: str) -> None:
    with pytest.raises(ErroEntrada):
        Movimento(Parametros(R=2, phi0=0, omega="1", v=v, dt=1))


@pytest.mark.parametrize("v", ["-0.1", "0.5 - 0.1*t", "0.2*sin(t)"])
def test_v_negativa(v: str) -> None:
    with pytest.raises(ErroEntrada, match="negativa"):
        Movimento(Parametros(R=2, phi0=0, omega="1", v=v, dt=1))


@pytest.mark.parametrize("campos", [{"R": 0}, {"R": -1}, {"dt": 0}, {"dt": -0.5}, {"t_instante": 99}])
def test_parametros_invalidos(campos: dict) -> None:
    base = dict(R=2, phi0=0, omega="0.5", v="0.25", dt=1)
    with pytest.raises(ErroEntrada):
        Movimento(Parametros(**{**base, **campos}))


def test_regra_de_alternancia() -> None:
    dt = 0.1
    for k in range(40):  # inclui k·Δt que dariam k−1 por arredondamento (3·0,1/0,1 = 2,999…)
        esperado = "vel" if k % 2 == 0 else "acc"
        assert grupo_no_instante(k * dt, dt) == esperado
        assert grupo_no_instante((k + 0.5) * dt, dt) == esperado


@pytest.mark.parametrize("caso", [1, 3])
def test_alternancia_nos_quadros_desenhados(caso: int) -> None:
    """Nos múltiplos pares de Δt só aparecem velocidades; nos ímpares, só acelerações."""
    from codigo.animacao import Escalas, VistaTopo, conferir_alternancia
    import matplotlib.pyplot as plt

    mov = Movimento(CASOS[caso].p)
    esc = Escalas.calcular(mov)
    _, ok = conferir_alternancia(mov, esc)
    assert ok
    fig, ax = plt.subplots()
    vista = VistaTopo(ax, mov, esc)
    for k, tk in enumerate(mov.instantes_dt()):
        vista.atualizar(float(tk))
        visiveis = {n for n, s in vista.setas.items() if s.get_visible()}
        assert visiveis <= set(VELOCIDADES if k % 2 == 0 else ACELERACOES)
        assert visiveis  # o grupo não pode sumir inteiro
    plt.close(fig)


def test_escala_fixa_maior_vetor_06R() -> None:
    from codigo.animacao import Escalas

    mov = Movimento(CASOS[2].p)
    esc = Escalas.calcular(mov)
    e = mov.estado(np.linspace(0, mov.t_f, 4001))
    assert max(e.modulo(n).max() for n in VELOCIDADES) * esc.vel == pytest.approx(0.6 * mov.R)
    assert max(e.modulo(n).max() for n in ACELERACOES) * esc.acc == pytest.approx(0.6 * mov.R)
