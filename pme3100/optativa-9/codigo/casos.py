"""Os quatro conjuntos de dados de entrada (itens a-g do enunciado)."""

from __future__ import annotations

import math
from dataclasses import dataclass

from .modelo import Parametros

M, K1, K2, C_AMORT, OMEGA = 1.0, -1.0, 1.0, 0.3, 1.2
T = 2 * math.pi / OMEGA  # t_max é múltiplo de T: h = T/200 exato e t = nT cai sobre a grade


@dataclass(frozen=True)
class Caso:
    chave: str
    titulo: str
    p: Parametros
    tmax: float
    condicoes: tuple[tuple[float, float], ...]  # (x0, v0) de cada trajetória mostrada


CASOS: dict[str, Caso] = {
    "A": Caso("A", "Duplo poço com força moderada",
              Parametros(M, K1, K2, C_AMORT, 0.37, OMEGA), 60 * T, ((0.084, 0.0),)),
    "B": Caso("B", "Oscilador autônomo",
              Parametros(M, K1, K2, C_AMORT, 0.0, OMEGA), 8 * T,
              ((1.0, 0.6), (1.0, 1.1), (1.0, 2.2))),
    "C": Caso("C", "Duplo poço com força maior",
              Parametros(M, K1, K2, C_AMORT, 0.50, OMEGA), 60 * T, ((1.0, 0.0),)),
    "D": Caso("D", "Poço único",
              Parametros(M, 1.0, K2, C_AMORT, 0.37, OMEGA), 24 * T, ((1.0, 0.0),)),
    "E": Caso("E", "Dois atratores distintos",
              Parametros(M, K1, K2, C_AMORT, 0.20, OMEGA), 24 * T, ((1.0, 0.0), (-1.0, 0.0))),
}
