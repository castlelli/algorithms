"""Geometria, cinemática e verificações da Tarefa 5."""

from __future__ import annotations

import math

import numpy as np
import pytest

from codigo.casos import PADRAO, Entradas
from codigo.cli import main
from codigo.modelo import CurvaEspacial, ErroEntrada, Hipocicloide, instante, razao_racional
from codigo.verificacao import medidas_hipocicloide, verificar


def test_checagens_padrao_passam() -> None:
    checks = verificar(PADRAO)
    assert len(checks) >= 15
    assert all(c.aprovado for c in checks), [c for c in checks if not c.aprovado]


@pytest.mark.parametrize("R, r", [(3, 1), (4, 1), (5, 1), (3.5, 1), (7, 2), (1.5, 1), (10, 3)])
def test_checagens_varias_razoes(R: float, r: float) -> None:
    h = Hipocicloide(R, r)
    for chave, valor in medidas_hipocicloide(h, math.pi / 60).items():
        assert valor < 1e-6, chave


def test_formula_original() -> None:
    """As equações do enunciado, escritas à parte."""
    R, r = 5.0, 1.0
    th = np.linspace(0, 2 * np.pi, 50)
    x = (R - r) * np.cos(th) + r * np.cos((R - r) / r * th)
    y = (R - r) * np.sin(th) - r * np.sin((R - r) / r * th)
    np.testing.assert_allclose(Hipocicloide(R, r).posicao(th), np.stack([x, y], axis=-1), atol=1e-14)


def test_racionais_e_bicos() -> None:
    assert razao_racional(3.5) == (7, 2)
    assert razao_racional(math.sqrt(2) * 3) is None
    h = Hipocicloide(3.5, 1)
    assert (h.p, h.q, h.n_bicos) == (7, 2, 7)
    assert h.theta_max == pytest.approx(4 * math.pi)
    b = h.bicos()
    assert len(b) == 8
    # Nos bicos P está sobre o aro e para.
    np.testing.assert_allclose(np.linalg.norm(h.posicao(b), axis=-1), h.R, atol=1e-12)
    np.testing.assert_allclose(np.linalg.norm(h.d1(b), axis=-1), 0, atol=1e-12)
    assert h.rho_fechado(b) == pytest.approx(np.zeros_like(b), abs=1e-12)


def test_irracional_nao_fecha() -> None:
    h = Hipocicloide(math.pi, 1)
    assert not h.fecha
    with pytest.raises(ErroEntrada):
        _ = h.theta_max


def test_curva_degenerada() -> None:
    """R = 2r: P anda sobre o diâmetro (y = 0) e ρ = ∞."""
    h = Hipocicloide(2, 1)
    assert h.degenerada
    th = np.linspace(0.1, 3, 20)
    np.testing.assert_allclose(h.posicao(th)[:, 1], 0, atol=1e-14)
    assert np.all(np.isinf(h.rho(th)))
    assert np.all(np.isinf(h.rho_fechado(th)))


@pytest.mark.parametrize("R, r", [(1, 1), (0.5, 1), (5, 0), (5, -1)])
def test_entrada_invalida(R: float, r: float) -> None:
    with pytest.raises(ErroEntrada):
        Hipocicloide(R, r)


def test_pontos_seguros_longe_dos_bicos() -> None:
    h = Hipocicloide(5, 1)
    for n in (1, 6, 8, 13):
        th = h.pontos_seguros(n)
        assert len(th) == n
        assert np.all(np.diff(th) > 0)
        assert np.all(np.abs(h.seno_meio(th)) > 0.05)


def test_instante_padrao() -> None:
    h = Hipocicloide(5, 1)
    i = instante(h, math.pi / 60, 30.0)
    assert i.theta == pytest.approx(math.pi / 2)
    # Forma intrínseca e cartesiana descrevem o mesmo vetor.
    np.testing.assert_allclose(i.rapidez * i.tau, i.v, atol=1e-15)
    np.testing.assert_allclose(i.a_t * i.tau + i.a_n * i.n, i.a, atol=1e-15)
    assert i.a_n == pytest.approx(i.rapidez**2 / i.rho, rel=1e-12)
    assert i.rapidez == pytest.approx(2 * 4 * math.pi / 60 * abs(math.sin(5 * math.pi / 4)), rel=1e-12)


def test_instante_no_bico() -> None:
    h = Hipocicloide(5, 1)
    with pytest.raises(ErroEntrada):
        instante(h, 1.0, 2 * math.pi / 5)


def test_frenet() -> None:
    f = CurvaEspacial.frenet(1.0)
    np.testing.assert_allclose(f.tau, np.array([1, 2, 3]) / math.sqrt(14), atol=1e-15)
    np.testing.assert_allclose(f.b, np.array([6, -6, 2]) / math.sqrt(76), atol=1e-15)
    assert f.rho == pytest.approx(14**1.5 / math.sqrt(76), rel=1e-14)
    assert f.torcao == pytest.approx(3 / 19, rel=1e-14)
    # Em λ = 0 a curva também é regular (κ = 2), embora o enunciado peça λ ≠ 0.
    assert CurvaEspacial.frenet(0.0).curvatura == pytest.approx(2.0)


def test_cli_tabela(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["--so-tabela"]) == 0
    saida = capsys.readouterr().out
    assert "5 bicos" in saida and "1.7" in saida and "2.2/2.3" in saida


@pytest.mark.parametrize("args", [["--R", "2", "--r", "1"], ["--R", "1", "--r", "2"], ["--lambdas", "0 1"],
                                  ["--R", "pi", "--r", "1"]])
def test_cli_rejeita(args: list[str], capsys: pytest.CaptureFixture[str]) -> None:
    assert main([*args, "--so-tabela"]) == 2
    assert "erro:" in capsys.readouterr().err


def test_entradas_personalizadas() -> None:
    e = Entradas(R=7, r=2, razoes=(2.5, 6), instantes=(5, 25), lambdas=(-0.5, 2))
    assert all(c.aprovado for c in verificar(e))
