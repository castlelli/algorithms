"""Dados de entrada da Tarefa 5: os mesmos valores que o programa original usava por padrão."""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class Entradas:
    R: float = 5.0                                  # raio do aro
    r: float = 1.0                                  # raio do disco
    razoes: tuple[float, ...] = (3.0, 4.0, 5.0, 3.5)  # item 1.4: quatro razões R/r
    omega: float = math.pi / 60                     # item 1.7: θ = ωt [rad/s]
    instantes: tuple[float, ...] = (10.0, 30.0, 50.0)  # item 1.7 [s]
    lambdas: tuple[float, ...] = (-1.0, 0.5, 1.0)    # itens 2.2 e 2.3
    pontos_rho: int = 6                             # item 1.5
    pontos_versores: int = 8                        # item 1.6
    quadros: int = 6                                # item 1.3


PADRAO = Entradas()
